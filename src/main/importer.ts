/**
 * Converts a legacy folder-based Braidr project (md + timeline.json + notes/)
 * into a new .braidr SQLite database file.
 *
 * Entry point: importLegacyProject(folderPath, outputDbPath)
 */

import * as fs from 'fs';
import * as path from 'path';
import { openDatabase, BraidrDB } from './database';
import type { Tag, TagCategory } from '../shared/types';

// ── lightweight MD parser (mirrors renderer/services/parser.ts) ───────────────

function stableId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'c' + Math.abs(hash).toString(36);
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

interface ParsedPlotPoint {
  id: string;
  title: string;
  description: string;
  expectedSceneCount: number | null;
  order: number;
}

interface ParsedScene {
  id: string;
  sceneNumber: number;
  title: string;
  synopsis: string;
  tags: string[];
  isHighlighted: boolean;
  notes: string[];
  plotPointId: string | null;
}

interface ParsedCharacter {
  id: string;
  name: string;
  plotPoints: ParsedPlotPoint[];
  scenes: ParsedScene[];
}

function parseOutlineMd(content: string, fileName: string): ParsedCharacter {
  const fileNameTag = fileName.replace('.md', '').toLowerCase().replace(/[\s-]+/g, '_');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  let characterName = fileName.replace('.md', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  let body = content;
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const m = fm.match(/character:\s*(.+)/);
    if (m) characterName = m[1].trim();
    body = content.slice(frontmatterMatch[0].length);
  }

  const charId = stableId(characterName.toLowerCase());
  const properTag = characterName.toLowerCase().replace(/\s+/g, '_');

  const lines = body.split('\n');
  const plotPoints: ParsedPlotPoint[] = [];
  const scenes: ParsedScene[] = [];

  let currentPP: ParsedPlotPoint | null = null;
  let ppDescLines: string[] = [];
  let currentScene: ParsedScene | null = null;
  let sceneNotes: string[] = [];
  let ppOrder = 0;

  function flushScene() {
    if (currentScene) {
      currentScene.notes = sceneNotes;
      scenes.push(currentScene);
      currentScene = null;
      sceneNotes = [];
    }
  }

  function flushPPDesc() {
    if (currentPP && ppDescLines.length > 0) {
      currentPP.description = ppDescLines.join('\n').trim();
      ppDescLines = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^##\s+.+/.test(trimmed)) {
      flushScene();
      flushPPDesc();
      const hMatch = trimmed.match(/^##\s+(.+?)(?:\s*\((\d+)\))?$/);
      const ppTitle = hMatch ? hMatch[1].trim() : trimmed.replace(/^##\s+/, '');
      const expectedCount = hMatch?.[2] ? parseInt(hMatch[2], 10) : null;
      currentPP = { id: randomId(), title: ppTitle, description: '', expectedSceneCount: expectedCount, order: ppOrder++ };
      plotPoints.push(currentPP);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushScene();
      flushPPDesc();
      const sMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (!sMatch) continue;
      const sceneNumber = parseInt(sMatch[1], 10);
      let rawContent = sMatch[2];

      let sid: string | null = null;
      const sidMatch = rawContent.match(/<!--\s*sid:(\S+)\s*-->/);
      if (sidMatch) {
        sid = sidMatch[1];
        rawContent = rawContent.replace(/\s*<!--\s*sid:\S+\s*-->/, '').trim();
      }

      const isHighlighted = /==\*\*.*\*\*==/.test(rawContent);
      let tags = (rawContent.match(/#([a-zA-Z0-9_]+)/g) ?? []).map(t => t.slice(1).toLowerCase());
      if (fileNameTag !== properTag) tags = tags.filter(t => t !== fileNameTag);
      if (!tags.includes(properTag)) tags.push(properTag);

      const cleanTitle = rawContent.replace(/#[a-zA-Z0-9_]+/g, '').replace(/\s+/g, ' ').trim();

      currentScene = {
        id: sid || randomId(),
        sceneNumber,
        title: cleanTitle,
        synopsis: rawContent,
        tags,
        isHighlighted,
        notes: [],
        plotPointId: currentPP?.id ?? null,
      };
      continue;
    }

    if ((/^\s+[\d\-\*]\.\s/.test(line) || /^\s+\d+\.\s/.test(line)) && currentScene) {
      sceneNotes.push(trimmed.replace(/^\s*[\d\-\*]+\.\s*/, ''));
      continue;
    }

    if (currentPP && !currentScene) {
      ppDescLines.push(trimmed);
    } else if (currentScene) {
      sceneNotes.push(trimmed);
    }
  }

  flushScene();
  flushPPDesc();

  return { id: charId, name: characterName, plotPoints, scenes };
}

// ── importer ──────────────────────────────────────────────────────────────────

export interface ImportResult {
  dbPath: string;
  characterCount: number;
  sceneCount: number;
  noteCount: number;
  warnings: string[];
}

export function importLegacyProject(folderPath: string, outputDbPath: string): ImportResult {
  const warnings: string[] = [];

  if (fs.existsSync(outputDbPath)) fs.unlinkSync(outputDbPath);
  const db = openDatabase(outputDbPath);

  db.transaction(() => {
    importData(db, folderPath, warnings);
  });

  const characters = db.getCharacters();
  const scenes = db.getScenes();
  const notes = db.getNotes();

  return {
    dbPath: outputDbPath,
    characterCount: characters.length,
    sceneCount: scenes.length,
    noteCount: notes.length,
    warnings,
  };
}

function importData(db: BraidrDB, folderPath: string, warnings: string[]) {
  const projectName = path.basename(folderPath);

  // ── project row ────────────────────────────────────────────────────────────

  let wordCountGoal: number | null = null;
  let timelineData: Record<string, any> = {};

  const timelinePath = path.join(folderPath, 'timeline.json');
  if (fs.existsSync(timelinePath)) {
    try {
      timelineData = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
      wordCountGoal = timelineData.wordCountGoal ?? null;
    } catch (e) {
      warnings.push(`Could not parse timeline.json: ${e}`);
    }
  }

  db.upsertProject(projectName, wordCountGoal);

  // ── settings (font, metadata field visibility, etc.) ──────────────────────

  if (timelineData.fontSettings) {
    db.setSetting('font_settings', JSON.stringify(timelineData.fontSettings));
  }
  if (timelineData.allFontSettings) {
    db.setSetting('all_font_settings', JSON.stringify(timelineData.allFontSettings));
  }
  if (timelineData.inlineMetadataFields !== undefined) {
    db.setSetting('inline_metadata_fields', JSON.stringify(timelineData.inlineMetadataFields));
  }
  if (timelineData.showInlineLabels !== undefined) {
    db.setSetting('show_inline_labels', JSON.stringify(timelineData.showInlineLabels));
  }
  if (timelineData.taskViews !== undefined) {
    db.setSetting('task_views', JSON.stringify(timelineData.taskViews));
  }
  if (timelineData.tableViews !== undefined) {
    db.setSetting('table_views', JSON.stringify(timelineData.tableViews));
  }
  if (timelineData.taskColumnWidths !== undefined) {
    db.setSetting('task_column_widths', JSON.stringify(timelineData.taskColumnWidths));
  }
  if (timelineData.taskVisibleColumns !== undefined) {
    db.setSetting('task_visible_columns', JSON.stringify(timelineData.taskVisibleColumns));
  }

  // ── tags ───────────────────────────────────────────────────────────────────

  const tagIdByName = new Map<string, string>();

  function ensureTag(name: string, category: string): string {
    if (tagIdByName.has(name)) return tagIdByName.get(name)!;
    const id = randomId();
    const resolvedId = db.upsertTag(id, name, category);
    tagIdByName.set(name, resolvedId);
    return resolvedId;
  }

  // Pre-populate with any persisted tag records from timeline.json
  const persistedTags: Tag[] = timelineData.tags ?? [];
  for (const tag of persistedTags) {
    ensureTag(tag.name, tag.category);
  }

  // ── characters & scenes ───────────────────────────────────────────────────

  const files = fs.readdirSync(folderPath);
  const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));

  const positions: Record<string, number> = timelineData.positions ?? {};
  const characterColors: Record<string, string> = timelineData.characterColors ?? {};
  const metadataFieldDefs: any[] = timelineData.metadataFieldDefs ?? [];
  const sceneMetadata: Record<string, Record<string, any>> = timelineData.sceneMetadata ?? {};
  const timelineDates: Record<string, string> = timelineData.timelineDates ?? {};
  const timelineEndDates: Record<string, string> = timelineData.timelineEndDates ?? {};

  // Map old "characterId:sceneNumber" key → new scene UUID
  const sceneKeyToId = new Map<string, string>();

  for (let charIdx = 0; charIdx < mdFiles.length; charIdx++) {
    const fileName = mdFiles[charIdx];
    const filePath = path.join(folderPath, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');

    const parsed = parseOutlineMd(content, fileName);
    const color = characterColors[parsed.id] ?? null;

    db.insertCharacter(parsed.id, parsed.name, color, charIdx);

    for (const pp of parsed.plotPoints) {
      db.insertPlotPoint(pp.id, parsed.id, pp.title, pp.description || null, pp.expectedSceneCount, pp.order);
    }

    for (const scene of parsed.scenes) {
      const oldKey = `${parsed.id}:${scene.sceneNumber}`;
      sceneKeyToId.set(oldKey, scene.id);

      const timelinePos = positions[oldKey] ?? null;

      db.insertScene(
        scene.id,
        parsed.id,
        scene.plotPointId,
        scene.title,
        scene.synopsis,
        scene.sceneNumber,
        timelinePos,
        scene.isHighlighted,
        null,
      );

      // Scene notes
      if (scene.notes.length > 0) {
        db.replaceSceneNotes(scene.id, scene.notes);
      }

      // Tags
      const tagIds = scene.tags.map(name => ensureTag(name, 'things'));
      db.replaceSceneTags(scene.id, tagIds);

      // Draft
      const draftPath = path.join(folderPath, 'drafts', `${scene.id}.md`);
      const draftContent = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, 'utf-8') : '';
      db.upsertDraft(scene.id, draftContent);

      // Draft versions
      const versionsPath = path.join(folderPath, 'drafts', `${scene.id}.versions.json`);
      if (fs.existsSync(versionsPath)) {
        try {
          const rawVersions: any[] = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));
          const rows = rawVersions.map((v, i) => ({
            id: randomId(),
            version: i + 1,
            content: v.content ?? '',
            saved_at: v.savedAt ?? Date.now(),
          }));
          db.replaceDraftVersions(scene.id, rows);
        } catch (e) {
          warnings.push(`Draft versions parse error for scene ${scene.id}: ${e}`);
        }
      }

      // Also try old key-based draft versions from timeline.json
      if (!fs.existsSync(versionsPath)) {
        const oldVersions: any[] = (timelineData.drafts ?? {})[oldKey] ?? [];
        if (oldVersions.length > 0) {
          const rows = oldVersions.map((v: any, i: number) => ({
            id: randomId(),
            version: i + 1,
            content: v.content ?? '',
            saved_at: v.savedAt ?? Date.now(),
          }));
          db.replaceDraftVersions(scene.id, rows);
        }
      }

      // Scratchpad
      const scratchPath = path.join(folderPath, 'scratchpad', `${scene.id}.md`);
      if (fs.existsSync(scratchPath)) {
        const scratchContent = fs.readFileSync(scratchPath, 'utf-8');
        db.upsertScratchpad(scene.id, scratchContent);
      } else {
        const oldScratch: string = (timelineData.scratchpad ?? {})[oldKey] ?? '';
        if (oldScratch) db.upsertScratchpad(scene.id, oldScratch);
      }

      // Comments
      const commentsPath = path.join(folderPath, 'comments', `${scene.id}.json`);
      if (fs.existsSync(commentsPath)) {
        try {
          const comments: any[] = JSON.parse(fs.readFileSync(commentsPath, 'utf-8'));
          db.replaceSceneComments(scene.id, comments.map(c => ({
            id: c.id ?? randomId(),
            text: c.text ?? '',
            created_at: c.createdAt ?? Date.now(),
          })));
        } catch (e) {
          warnings.push(`Comments parse error for scene ${scene.id}: ${e}`);
        }
      } else {
        const oldComments: any[] = (timelineData.sceneComments ?? {})[oldKey] ?? [];
        if (oldComments.length > 0) {
          db.replaceSceneComments(scene.id, oldComments.map((c: any) => ({
            id: c.id ?? randomId(),
            text: c.text ?? '',
            created_at: c.createdAt ?? Date.now(),
          })));
        }
      }

      // Scene date
      const dateKey = oldKey;
      if (timelineDates[dateKey]) {
        db.upsertSceneDate(scene.id, timelineDates[dateKey], timelineEndDates[dateKey] ?? null);
      }

      // Metadata values
      if (sceneMetadata[oldKey]) {
        const values = Object.entries(sceneMetadata[oldKey]).map(([fieldDefId, val]) => ({
          field_def_id: fieldDefId,
          value: JSON.stringify(val),
        }));
        db.replaceSceneMetadataValues(scene.id, values);
      }
    }
  }

  // ── metadata field defs ───────────────────────────────────────────────────

  if (metadataFieldDefs.length > 0) {
    db.replaceMetadataFieldDefs(metadataFieldDefs.map((d: any) => ({
      id: d.id,
      label: d.label,
      field_type: d.type ?? 'text',
      options: d.options ? JSON.stringify(d.options) : null,
      option_colors: d.optionColors ? JSON.stringify(d.optionColors) : null,
      display_order: d.order ?? 0,
    })));
  }

  // ── braided chapters ───────────────────────────────────────────────────────

  const chapters: any[] = timelineData.chapters ?? [];
  db.replaceBraidedChapters(chapters.map(c => ({
    id: c.id ?? randomId(),
    title: c.title ?? '',
    before_position: c.beforePosition ?? 0,
  })));

  // ── archived scenes ────────────────────────────────────────────────────────

  const archivedScenes: any[] = timelineData.archivedScenes ?? [];
  for (const a of archivedScenes) {
    db.insertArchivedScene({
      id: a.id ?? randomId(),
      character_id: a.characterId ?? '',
      original_plot_point_id: a.plotPointId ?? null,
      original_scene_number: a.originalSceneNumber ?? 0,
      title: a.title ?? '',
      synopsis: a.content ?? '',
      draft_content: a.draftContent ?? null,
      tags: JSON.stringify(a.tags ?? []),
      notes: JSON.stringify(a.notes ?? []),
      is_highlighted: a.isHighlighted ? 1 : 0,
      word_count: a.wordCount ?? null,
      archived_at: a.archivedAt ?? Date.now(),
    });
  }

  // ── tasks ──────────────────────────────────────────────────────────────────

  const tasks: any[] = timelineData.tasks ?? [];
  const taskFieldDefs: any[] = timelineData.taskFieldDefs ?? [];

  db.replaceTaskFieldDefs(taskFieldDefs.map((d: any) => ({
    id: d.id,
    name: d.name,
    field_type: d.type ?? 'text',
    options: d.options ? JSON.stringify(d.options) : null,
    display_order: d.order ?? 0,
  })));

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const sceneId = t.sceneKey ? (sceneKeyToId.get(t.sceneKey) ?? null) : null;

    db.insertTask(t.id, {
      title: t.title ?? '',
      description: t.description ?? null,
      status: t.status ?? 'open',
      priority: t.priority ?? 'none',
      sceneId,
      timeEstimate: t.timeEstimate ?? null,
      dueDate: t.dueDate ?? null,
      displayOrder: t.order ?? i,
    });

    // Tags
    const taskTagIds = (t.tags ?? []).map((name: string) => ensureTag(name, 'things'));
    db.replaceTaskTags(t.id, taskTagIds);

    // Character links
    if (t.characterIds?.length) {
      db.replaceTaskCharacterLinks(t.id, t.characterIds);
    }

    // Time entries
    if (t.timeEntries?.length) {
      db.replaceTimeEntries(t.id, t.timeEntries.map((e: any) => ({
        id: e.id ?? randomId(),
        started_at: e.startedAt ?? Date.now(),
        duration: e.duration ?? 0,
        description: e.description ?? null,
      })));
    }

    // Custom field values
    if (t.customFields && Object.keys(t.customFields).length > 0) {
      const vals = Object.entries(t.customFields).map(([fieldDefId, val]) => ({
        field_def_id: fieldDefId,
        value: JSON.stringify(val),
      }));
      db.replaceTaskCustomFieldValues(t.id, vals);
    }
  }

  // ── world events ───────────────────────────────────────────────────────────

  const worldEvents: any[] = timelineData.worldEvents ?? [];
  for (const ev of worldEvents) {
    db.insertWorldEvent(ev.id, ev.title ?? '', ev.date ?? '', ev.endDate ?? null, ev.description ?? '');

    const evTagIds = (ev.tags ?? []).map((name: string) => ensureTag(name, 'things'));
    db.replaceWorldEventTags(ev.id, evTagIds);

    const linkedSceneIds = (ev.linkedSceneKeys ?? [])
      .map((key: string) => sceneKeyToId.get(key))
      .filter(Boolean) as string[];
    db.replaceWorldEventSceneLinks(ev.id, linkedSceneIds);

    db.replaceWorldEventNoteLinks(ev.id, ev.linkedNoteIds ?? []);
  }

  // ── writing sessions ───────────────────────────────────────────────────────

  // (Sessions are not currently persisted in old format — skip)

  // ── notes ──────────────────────────────────────────────────────────────────

  const notesIndexPath = path.join(folderPath, 'notes', 'notes-index.json');
  if (fs.existsSync(notesIndexPath)) {
    try {
      const notesIndex = JSON.parse(fs.readFileSync(notesIndexPath, 'utf-8'));
      const noteMetas: any[] = notesIndex.notes ?? [];

      // Pass 1: insert all notes (satisfies parentId FK before any links are wired)
      // Sort so parents come before children
      const sorted = [...noteMetas].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return 0;
      });
      for (const meta of sorted) {
        const htmlPath = path.join(folderPath, 'notes', meta.fileName);
        const noteContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '';
        db.insertNote(meta.id, meta.title ?? '', noteContent, meta.parentId ?? null, meta.order ?? 0);
        const noteTagIds = (meta.tags ?? []).map((name: string) => ensureTag(name, 'things'));
        db.replaceNoteTags(meta.id, noteTagIds);
      }

      // Pass 2: wire up inter-note links and note→scene links (all notes exist now)
      for (const meta of sorted) {
        db.replaceNoteLinks(meta.id, meta.outgoingLinks ?? []);
        const noteSceneIds = (meta.sceneLinks ?? [])
          .map((key: string) => sceneKeyToId.get(key))
          .filter(Boolean) as string[];
        db.replaceNoteSceneLinks(meta.id, noteSceneIds);
      }

      // Archived notes
      const archivedNotes: any[] = notesIndex.archivedNotes ?? [];
      for (const an of archivedNotes) {
        db.insertArchivedNote({
          id: an.id,
          title: an.title ?? '',
          content: an.content ?? '',
          parent_id: an.parentId ?? null,
          tags: JSON.stringify(an.tags ?? []),
          archived_at: an.archivedAt ?? Date.now(),
        });
      }
    } catch (e) {
      warnings.push(`Could not import notes: ${e}`);
    }
  }

  // ── branches ───────────────────────────────────────────────────────────────

  const branchIndexPath = path.join(folderPath, 'branches', 'index.json');
  if (fs.existsSync(branchIndexPath)) {
    try {
      const branchIndex = JSON.parse(fs.readFileSync(branchIndexPath, 'utf-8'));
      const branchInfos: any[] = branchIndex.branches ?? [];

      // Always ensure 'main' branch exists
      const hasMain = branchInfos.some((b: any) => b.name === 'main');
      if (!hasMain) {
        db.insertBranch(randomId(), 'main', null, null);
      }

      for (const b of branchInfos) {
        const branchId = randomId();
        db.insertBranch(branchId, b.name, b.description ?? null, null);

        // Snapshot .md files from the branch folder
        const branchDir = path.join(folderPath, 'branches', b.name);
        if (!fs.existsSync(branchDir)) continue;
        const branchMdFiles = fs.readdirSync(branchDir).filter(f => f.endsWith('.md') && !f.startsWith('CLAUDE'));

        for (const fname of branchMdFiles) {
          const fc = fs.readFileSync(path.join(branchDir, fname), 'utf-8');
          const pc = parseOutlineMd(fc, fname);
          for (const scene of pc.scenes) {
            const oldKey = `${pc.id}:${scene.sceneNumber}`;
            const branchPosFile = path.join(branchDir, 'positions.json');
            const branchPositions: Record<string, number> = fs.existsSync(branchPosFile)
              ? JSON.parse(fs.readFileSync(branchPosFile, 'utf-8'))
              : {};
            db.insertBranchSnapshot({
              id: randomId(),
              branch_id: branchId,
              scene_id: sceneKeyToId.get(oldKey) ?? scene.id,
              character_id: pc.id,
              plot_point_id: scene.plotPointId,
              title: scene.title,
              synopsis: scene.synopsis,
              draft_content: null,
              scene_number: scene.sceneNumber,
              timeline_position: branchPositions[oldKey] ?? null,
              is_highlighted: scene.isHighlighted ? 1 : 0,
            });
          }
        }
      }

      const activeBranch = branchIndex.activeBranch;
      if (activeBranch) {
        const branchRows = db.getBranches();
        const active = branchRows.find(r => r.name === activeBranch);
        if (active) db.setActiveBranch(active.id);
      }
    } catch (e) {
      warnings.push(`Could not import branches: ${e}`);
    }
  } else {
    // No branch index — just create main
    db.insertBranch(randomId(), 'main', null, null);
  }
}

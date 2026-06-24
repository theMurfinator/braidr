import { RecentProject, ProjectTemplate } from '../../shared/types';
import { UpdateBanner } from './UpdateBanner';
import UpdateModal from './UpdateModal';
import braidrLogo from '../assets/braidr-logo.png';

function WeeklyMiniWidget({ project }: { project: RecentProject }) {
  const perDayHours = project.weeklyPerDayHours || [];
  const perDayWords = project.weeklyPerDayWords || [];
  const labels = project.weeklyDayLabels || ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const todayIdx = project.weeklyTodayIdx ?? -1;
  const hoursTarget = project.weeklyHoursTarget || 0;
  const wordsTarget = project.weeklyWordsTarget || 0;
  const totalHours = perDayHours.reduce((a, b) => a + b, 0);
  const totalWords = perDayWords.reduce((a, b) => a + b, 0);
  const maxH = Math.max(...perDayHours, hoursTarget / 7, 0.1);
  const maxW = Math.max(...perDayWords.map(Math.abs), wordsTarget / 7, 1);

  if (perDayHours.length === 0 && perDayWords.length === 0) return null;

  return (
    <div className="landing-weekly-widgets">
      <div className="landing-weekly-title">{project.name} — this week</div>
      <div className="landing-weekly-charts">

        {/* Hours card */}
        <div className="landing-mini-card">
          <div className="landing-mini-chart-header">
            <span className="landing-mini-chart-label">Weekly Hours</span>
            <span className="landing-mini-chart-total">
              {totalHours >= 10 ? totalHours.toFixed(0) : totalHours.toFixed(1)}h
              {hoursTarget > 0 && <span className="landing-mini-chart-target"> / {hoursTarget}h</span>}
            </span>
          </div>
          <div className="landing-mini-bars">
            {perDayHours.map((h, i) => {
              const barH = (h / maxH) * 100;
              const isToday = i === todayIdx;
              const isFuture = todayIdx >= 0 && i > todayIdx;
              return (
                <div key={i} className="landing-mini-bar-group">
                  <div className="landing-mini-bar-track">
                    <div
                      className={`landing-mini-bar hours${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${h > 0 ? ' active' : ''}`}
                      style={{ height: `${Math.max(barH, h > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                  <div className={`landing-mini-bar-label${isToday ? ' today' : ''}`}>{labels[i]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Words card */}
        <div className="landing-mini-card">
          <div className="landing-mini-chart-header">
            <span className="landing-mini-chart-label">Weekly Words</span>
            <span className={`landing-mini-chart-total${totalWords < 0 ? ' negative' : ''}`}>
              {totalWords >= 0 ? '+' : ''}{Math.abs(totalWords) >= 1000
                ? `${totalWords < 0 ? '-' : ''}${(Math.abs(totalWords) / 1000).toFixed(1)}k`
                : totalWords}
              {wordsTarget > 0 && <span className="landing-mini-chart-target"> / {wordsTarget >= 1000 ? `${(wordsTarget / 1000).toFixed(1)}k` : wordsTarget}</span>}
            </span>
          </div>
          <div className="landing-mini-bars">
            {perDayWords.map((w, i) => {
              const barH = (Math.abs(w) / maxW) * 100;
              const isToday = i === todayIdx;
              const isFuture = todayIdx >= 0 && i > todayIdx;
              const isNeg = w < 0;
              return (
                <div key={i} className="landing-mini-bar-group">
                  <div className="landing-mini-bar-track">
                    <div
                      className={`landing-mini-bar words${isToday ? ' today' : ''}${isFuture ? ' future' : ''}${w !== 0 ? ' active' : ''}${isNeg ? ' negative' : ''}`}
                      style={{ height: `${Math.max(barH, w !== 0 ? 6 : 0)}%` }}
                    />
                  </div>
                  <div className={`landing-mini-bar-label${isToday ? ' today' : ''}`}>{labels[i]}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

interface LockConflict {
  projectPath: string;
  projectName?: string;
  heldBy: string;
}

interface Props {
  recentProjects: RecentProject[];
  loading: boolean;
  error: string | null;
  showUpdateModal: boolean;
  onCloseUpdateModal: () => void;
  showNewProject: boolean;
  onSetShowNewProject: (show: boolean) => void;
  newProjectName: string;
  onNewProjectNameChange: (name: string) => void;
  newProjectLocation: string | null;
  onNewProjectLocationChange: (loc: string | null) => void;
  newProjectTemplate: ProjectTemplate;
  onTemplateChange: (template: ProjectTemplate) => void;
  onCreateNewProject: () => void;
  onSelectFolder: () => void;
  onOpenRecentProject: (project: RecentProject) => void;
  onRemoveRecentProject: (projectPath: string) => void;
  onSelectLocation: () => void;
  onClearError: () => void;
  lockConflict: LockConflict | null;
  onCloseLockConflict: () => void;
  onTakeOver: (projectPath: string, projectName?: string) => void;
}

const TEMPLATE_OPTIONS: { id: ProjectTemplate; name: string; description: string }[] = [
  { id: 'three-act', name: 'Three-Act Structure', description: 'Classic setup, confrontation, resolution' },
  { id: 'save-the-cat', name: 'Save the Cat', description: '15 beats from Opening Image to Final Image' },
  { id: 'heros-journey', name: "Hero's Journey", description: '12 stages of the monomyth' },
  { id: 'blank', name: 'Blank', description: 'Start from scratch' },
];

const DEFAULT_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#f59e0b'];

export default function LandingScreen({
  recentProjects, loading, error, showUpdateModal, onCloseUpdateModal,
  showNewProject, onSetShowNewProject, newProjectName, onNewProjectNameChange,
  newProjectLocation, onNewProjectLocationChange, newProjectTemplate, onTemplateChange,
  onCreateNewProject, onSelectFolder, onOpenRecentProject, onRemoveRecentProject, onSelectLocation,
  onClearError, lockConflict, onCloseLockConflict, onTakeOver,
}: Props) {
  return (
    <div className="app">
      {!showUpdateModal && <UpdateBanner />}
      <div className="main-content welcome-main-content">
        <div className="welcome-screen">
          {!showNewProject ? (
            <>
              <div className="welcome-header">
                <img src={braidrLogo} alt="Braidr" className="welcome-logo" />
              </div>

              {recentProjects.length > 0 && recentProjects[0].weeklyPerDayHours && (
                <WeeklyMiniWidget project={recentProjects[0]} />
              )}

              <div className="welcome-grid">
                <button
                  className="welcome-new-card"
                  onClick={() => onSetShowNewProject(true)}
                  disabled={loading}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M16 10v12M10 16h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="welcome-new-label">New Novel</span>
                </button>

                {recentProjects.map(project => {
                  const charNames = project.characterNames || [];
                  const charIds = project.characterIds || [];
                  const colors = project.characterColors || {};
                  const charColors = charNames.map((_, i) => {
                    const id = charIds[i];
                    return (id && colors[id]) || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
                  });
                  const initials = charNames.slice(0, 4).map(name => {
                    const parts = name.trim().split(/\s+/);
                    return parts.length >= 2
                      ? (parts[0][0] + parts[1][0]).toUpperCase()
                      : name.substring(0, 2).toUpperCase();
                  });
                  const extraCount = charNames.length > 4 ? charNames.length - 4 : 0;

                  return (
                    <div key={project.path} className="welcome-project-card-wrapper">
                    <button
                      className="welcome-project-card"
                      onClick={() => onOpenRecentProject(project)}
                      disabled={loading}
                    >
                      <div className="welcome-card-color-bar">
                        {charColors.slice(0, 5).map((color, i) => (
                          <span key={i} className="welcome-card-color-segment" style={{ background: color }} />
                        ))}
                      </div>
                      <div className="welcome-card-body">
                        <div className="welcome-card-title">{project.name}</div>
                        <div className="welcome-card-stats">
                          {(project.characterCount || 0) > 0 || (project.sceneCount || 0) > 0 ? (
                            <>
                              {(project.characterCount || 0) > 0 && (
                                <>{project.characterCount} Perspective{(project.characterCount || 0) !== 1 ? 's' : ''}</>
                              )}
                              {(project.sceneCount || 0) > 0 && (
                                <>{(project.characterCount || 0) > 0 ? ' · ' : ''}{project.sceneCount} Scene{(project.sceneCount || 0) !== 1 ? 's' : ''}</>
                              )}
                              {(project.totalWordCount ?? 0) > 0 && (
                                <>{' · '}{((project.totalWordCount || 0) / 1000).toFixed(1)}k words</>
                              )}
                            </>
                          ) : (
                            <>Opened {new Date(project.lastOpened).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                          )}
                        </div>
                        <div className="welcome-card-bottom">
                          <div className="welcome-card-avatars">
                            {initials.map((ini, i) => (
                              <span
                                key={i}
                                className="welcome-card-avatar"
                                style={{ background: charColors[i] || '#9CA3AF' }}
                              >
                                {ini}
                              </span>
                            ))}
                            {extraCount > 0 && (
                              <span className="welcome-card-avatar welcome-card-avatar-extra">+{extraCount}</span>
                            )}
                          </div>
                          <svg className="welcome-card-arrow" width="18" height="18" viewBox="0 0 20 20" fill="none">
                            <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </div>
                    </button>
                    <button
                      className="welcome-project-remove"
                      onClick={(e) => { e.stopPropagation(); onRemoveRecentProject(project.path); }}
                      title="Remove from recents"
                      disabled={loading}
                    >×</button>
                    </div>
                  );
                })}
              </div>

              <button
                className="welcome-import-btn"
                onClick={onSelectFolder}
                disabled={loading}
              >
                Import existing folder
              </button>

              {error && <p className="error-message">{error}</p>}
            </>
          ) : (
            <>
              <h2>Create New Novel</h2>

              <div className="new-project-form">
                <div className="form-group">
                  <label>Novel Title</label>
                  <input
                    type="text"
                    placeholder="My Novel"
                    value={newProjectName}
                    onChange={e => onNewProjectNameChange(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Location</label>
                  <div className="location-picker">
                    <span className="location-path">
                      {newProjectLocation || 'Choose where to save...'}
                    </span>
                    <button className="btn btn-small" onClick={onSelectLocation}>
                      Browse
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Story Structure Template</label>
                  <div className="template-options">
                    {TEMPLATE_OPTIONS.map(template => (
                      <button
                        key={template.id}
                        className={`template-option ${newProjectTemplate === template.id ? 'selected' : ''}`}
                        onClick={() => onTemplateChange(template.id)}
                      >
                        <span className="template-name">{template.name}</span>
                        <span className="template-desc">{template.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      onSetShowNewProject(false);
                      onNewProjectNameChange('');
                      onNewProjectLocationChange(null);
                      onClearError();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={onCreateNewProject}
                    disabled={!newProjectName.trim() || !newProjectLocation || loading}
                  >
                    {loading ? 'Creating...' : 'Create Novel'}
                  </button>
                </div>

                {error && <p className="error-message">{error}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {showUpdateModal && <UpdateModal onClose={onCloseUpdateModal} />}

      {lockConflict && (
        <div className="lock-takeover-overlay" onClick={onCloseLockConflict}>
          <div className="lock-takeover-dialog" onClick={e => e.stopPropagation()}>
            <h3>Project already open</h3>
            <p>This project is currently being edited on <strong>{lockConflict.heldBy}</strong>.</p>
            <p>Taking over will close the project on that device.</p>
            <div className="lock-takeover-actions">
              <button onClick={onCloseLockConflict}>Cancel</button>
              <button
                className="lock-takeover-confirm"
                onClick={() => onTakeOver(lockConflict.projectPath, lockConflict.projectName)}
              >
                Take Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

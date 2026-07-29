# PLAN: Terms of Service page for getbraidr.com

Status: DONE (shipped 2026-07-03, commit ff7e0b3, live at https://getbraidr.com/terms — verified by Fable post-stop: copy spot checks, curly-quote check, and all four footer links pass)
Executor: Sonnet 5
Author: Fable (launch team), 2026-07-03

## Context

The landing site (`/Users/brian/braidr/braidr-landing`, its own git repo, deploys to Vercel on push to `main`) has a Privacy Policy page at `app/(marketing)/privacy/page.tsx` but no Terms of Service. Terms are required before charging users. This plan adds a `/terms` page and links it from every footer.

## Confirmed by Brian (2026-07-03)

1. **Legal entity**: "Braidr, operated by Brian Murphy" (sole proprietor).
2. **Governing law**: South Carolina.
3. **Contact email**: `brian@murfinator.com` (his real inbox; no getbraidr.com email exists yet).
4. **Refund policy**: 30-day money-back, no questions asked.

## Implementation steps

1. Create `app/(marketing)/terms/page.tsx`. Mirror the structure, styling, metadata pattern, and component conventions of `app/(marketing)/privacy/page.tsx` exactly (read it first). Page title: "Terms of Service". Same typographic treatment, same section layout.
2. Use the copy in the "FINAL COPY" section below VERBATIM. Do not rewrite, expand, or "improve" it. Use ASCII straight quotes and apostrophes only (U+0027), never curly quotes, never em dashes. After writing, verify clean with:
   `python3 -c "import sys; c=open('app/(marketing)/terms/page.tsx').read(); bad=[ch for ch in c if ch in '‘’“”—']; print('FAIL:',bad) if bad else print('clean')"` (must print "clean").
3. Add a "Terms of Service" footer link next to the existing "Privacy Policy" link in each of these files (match each file's existing link markup exactly):
   - `app/(marketing)/page.tsx`
   - `app/(marketing)/privacy/page.tsx`
   - `app/(marketing)/changelog/page.tsx`
   - `app/components/guide/GuideFooter.tsx`
   - Do NOT touch `app/(marketing)/new/page.tsx` (dormant draft).
4. Verification (all must pass before commit):
   - `npm run build` succeeds.
   - `npm run start -- -p 3199` then `curl -s http://localhost:3199/terms | grep -c "Terms of Service"` returns nonzero; kill the server after.
   - Curly-quote grep from step 2 returns nothing.
   - Every footer listed above renders the new link.
5. Commit to `main` of the braidr-landing repo with message "Add Terms of Service page" and push (Vercel auto-deploys). Then verify live: `curl -sI https://getbraidr.com/terms` returns 200 within ~3 minutes.
6. Mark this plan DONE by changing the Status line, and report: files changed, verification output, live URL.

## FINAL COPY (verbatim; last updated date = ship date)

# Terms of Service

Last updated: [SHIP DATE]

Braidr is a desktop writing tool made by Braidr, operated by Brian Murphy ("Braidr", "we", "us"). These terms are the agreement between you and us when you download or use Braidr. We have kept them short and in plain language on purpose.

## 1. The short version

You own everything you write. Braidr stores your work in files on your own computer, and we never see it, touch it, or claim any rights to it. You are paying for a license to use the software, we will treat you fairly, and if something goes wrong you can email us and a human will respond.

## 2. Accepting these terms

By downloading, installing, or using Braidr, you agree to these terms. If you do not agree, do not use Braidr.

## 3. Your writing is yours

Everything you create in Braidr (outlines, scenes, drafts, notes, metadata) belongs entirely to you. Your projects are stored as .braidr files on your own machine. We do not upload, access, analyze, or train anything on your writing. If you stop using Braidr or your subscription ends, those files stay on your computer and remain yours.

## 4. Your license

When you buy Braidr (or use the free trial), we grant you a personal, non-exclusive, non-transferable license to install and use Braidr on devices you own. This license is for you, not for resale, sharing, or redistribution.

## 5. Free trial

New users get a 14-day free trial with every feature included. No credit card required. When the trial ends, you can purchase a license to keep using Braidr. Your files remain yours and stay on your machine either way.

## 6. Payment, renewal, and cancellation

Paid licenses are billed through Stripe at the price shown on our pricing page at the time of purchase. Subscriptions renew automatically at the end of each billing period. You can cancel anytime, and cancelling means you keep access for the time you have already paid for and simply are not billed again. We will never make cancelling harder than buying.

## 7. Refunds

If Braidr is not working out within 30 days of a purchase, email us and we will refund you in full. No forms, no hoops.

## 8. Fair use of the software

Please do not resell, redistribute, or share your license; copy or crack the software; or reverse-engineer it except where the law says we cannot stop you. That is the whole list.

## 9. Updates

Braidr updates itself automatically so you always have the latest version. Features may be added, changed, or occasionally removed as the product evolves. We work hard not to break your workflow.

## 10. Analytics and privacy

The app and website collect limited usage analytics to help us improve Braidr. This never includes the content of your writing. Details are in our Privacy Policy.

## 11. Back up your work, and our liability

Braidr includes backup tools, and we strongly encourage you to keep backups of your project files, as with any software that holds work you care about. Braidr is provided "as is". To the maximum extent permitted by law, we are not liable for indirect or consequential damages, and our total liability is capped at the amount you paid us in the twelve months before the claim.

## 12. Ending this agreement

You can stop using Braidr at any time. We may terminate a license that violates these terms, and we will tell you why. Section 3 survives no matter what: your writing is always yours.

## 13. Changes to these terms

If we change these terms in any meaningful way, we will post the update here with a new date and note it in the app or changelog. Continuing to use Braidr after a change means you accept the updated terms.

## 14. Governing law

These terms are governed by the laws of the State of South Carolina, USA, without regard to conflict-of-law rules.

## 15. Contact

Questions, refunds, anything else: brian@murfinator.com. Braidr is made by one person, and that is his real inbox.

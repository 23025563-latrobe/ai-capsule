import { validateCapsule } from '../server/capsule-validation.js';

const fictionNote = 'Fictional demonstration data, not evidence of a real AI interaction.';
const examples = [
  {
    project_name: 'Demo — API foundations', prompt_title: 'Explain an Express route',
    prompt_version: 'v1', category: 'Coding', usefulness: 'Good', reviewed: true, improved: true,
    prompt_text: 'Explain how GET /api/health works in Express. Describe the request, route handler and JSON response, then show a small example returning {"status":"ok"}.',
    response_summary: 'Outlined the request lifecycle and a short route handler. Added a note that a health response does not prove database connectivity.',
    notes: 'Useful for explaining the backend during a demonstration.',
  },
  {
    project_name: 'Demo — React workspace', prompt_title: 'Fix a stale state update',
    prompt_version: 'v2', category: 'Debugging', usefulness: 'Needs improvement', reviewed: true, improved: false,
    prompt_text: 'A React counter calls setCount(count + 1) twice in one click handler but increases only once. Explain the cause and suggest a functional update. Keep the explanation suitable for a student.',
    response_summary: 'Explained batched updates and stale values, but the example needs a clearer distinction between rendering and event handling.',
    notes: 'Review the explanation before using it in study notes.',
  },
  {
    project_name: 'Demo — API foundations', prompt_title: 'Plan capsule API tests',
    prompt_version: 'test-plan', category: 'Testing', usefulness: 'Good', reviewed: false, improved: false,
    prompt_text: 'Draft a focused HTTP test plan for authenticated capsule CRUD. Include missing and invalid JWTs, ownership isolation, input validation, PUT replacement and an empty DELETE 204 response.',
    response_summary: 'Grouped tests by authentication, validation and owner-scoped CRUD, with isolated databases and fictional fixtures.',
    notes: '',
  },
  {
    project_name: 'Demo — Assessment writing', prompt_title: 'Revise a project introduction',
    prompt_version: 'draft-B', category: 'Writing', usefulness: 'Needs improvement', reviewed: false, improved: true,
    prompt_text: 'Revise this fictional introduction for clarity: "This project is a website where students keep AI prompts and think about responses." Use a concise academic tone without adding claims about measured learning outcomes.',
    response_summary: 'Suggested a clearer introduction. Removed an unsupported claim about improved academic performance during the fictional revision.',
    notes: 'Compare the wording with the project scope before including it in a report.',
  },
  {
    project_name: 'Demo — Database decisions', prompt_title: 'Compare relational databases',
    prompt_version: 'v1', category: 'Research', usefulness: '', reviewed: false, improved: false,
    prompt_text: 'Compare SQLite, PostgreSQL and Azure SQL for a small React and Express assessment app. Discuss deployment, concurrent writes, persistent storage and operational complexity. Separate assumptions from facts that require documentation.',
    response_summary: '', notes: 'An unrated example with an intentionally empty response summary.',
  },
  {
    project_name: 'Demo — Cloud release', prompt_title: 'Prepare a deployment checklist',
    prompt_version: 'v2', category: 'Planning', usefulness: 'Good', reviewed: true, improved: false,
    prompt_text: 'Prepare a release checklist for a single-origin React and Express app on Azure. Cover HTTPS, environment variables, OAuth callback registration, database permissions, public health checks and restart persistence. Include a check for free-tier limits.',
    response_summary: 'Produced a staged checklist from configuration through deployment verification. Added an explicit reminder to keep credentials out of source control.',
    notes: 'Use as a fictional planning example, not proof that a release was completed.',
  },
  {
    project_name: 'Demo — Security study', prompt_title: 'Explain OAuth and JWT sessions',
    prompt_version: 'study-1', category: 'Study', usefulness: '', reviewed: true, improved: true,
    prompt_text: 'Explain the different roles of GitHub OAuth and an application JWT. Follow a browser from login to callback, session creation and logout. Explain why the GitHub access token stays on the server and why the application cookie is HttpOnly.',
    response_summary: 'Separated provider authorization from application sessions and described the cookie lifecycle. Clarified that a frontend route guard does not replace backend verification.',
    notes: '',
  },
  {
    project_name: 'Demo — Data preparation', prompt_title: 'Review a data-cleaning approach',
    prompt_version: 'v3', category: 'Data analysis', usefulness: 'Good', reviewed: true, improved: true,
    prompt_text: 'Review a fictional CSV-cleaning plan: trim headings, parse dates, identify duplicate IDs and flag missing measurements. Explain when rows should be flagged instead of removed. Preserve the original file and describe each transformation.',
    response_summary: 'Recommended a reproducible cleaning log and explicit missing-value rules. Replaced automatic row deletion with a separate review list.',
    notes: 'Custom category example; no real dataset is included.',
  },
  {
    project_name: 'Demo — React workspace', prompt_title: 'Review keyboard navigation',
    prompt_version: 'a11y-A', category: 'Accessibility', usefulness: 'Needs improvement', reviewed: false, improved: false,
    prompt_text: 'Create a keyboard-only review checklist for a capsule form and detail page. Cover associated labels, visible focus, validation links, cancellation, status announcements and returning to the list. Avoid claiming that this checklist establishes full accessibility compliance.',
    response_summary: 'Listed useful keyboard checks, but omitted what happens to focus after a failed save.',
    notes: 'A fictional review plan; actual keyboard checks must be performed separately.',
  },
  {
    project_name: 'Demo — Text handling', prompt_title: 'Preserve multiline prompt text',
    prompt_version: 'v2-long', category: 'Coding', usefulness: 'Good', reviewed: true, improved: false,
    prompt_text: `Review the following fictional JavaScript example. Explain how to display the text safely in React and copy the original string without changing its whitespace.

The example includes apostrophes, "double quotes", an ampersand & Unicode: café, 你好, and 👋. Treat <strong>example</strong> as text rather than HTML.

\`\`\`js
const message = "L'été & café — 你好 👋";
const lines = [
  message,
  "  Keep these two leading spaces.",
  "Quotes: 'single' and \\\"double\\\"."
];
const prompt = lines.join("\\n");
\`\`\`

Suggest CSS that preserves line breaks while wrapping a long line inside a narrow card. Explain why visual wrapping must not alter the string passed to the Clipboard API.

Finish with a short test plan for exact copying, failed clipboard access and mobile overflow. Do not execute the example or rewrite its contents.`,
    response_summary: 'Suggested plain-text rendering, pre-wrap with overflow wrapping, and copying the unchanged stored value. Proposed multiline, Unicode and clipboard-failure tests.',
    notes: 'Long-form demonstration for wrapping and copying; contains no private code.',
  },
];

export const demoCapsules = examples.map((example) => ({
  response_summary: '', screenshot_url: '', ...example,
  notes: `${fictionNote}${example.notes ? ` ${example.notes}` : ''}`,
}));

function demoKey(capsule) {
  return JSON.stringify([capsule.project_name, capsule.prompt_title]);
}

export async function seedDemoCapsules(storage, ownerId) {
  if (typeof ownerId !== 'string' || !/^[1-9]\d*$/.test(ownerId)) {
    throw new TypeError('A verified numeric GitHub owner ID is required.');
  }
  const records = demoCapsules.map((record) => {
    const { fields, errors } = validateCapsule(record);
    if (errors.length) throw new Error('Demonstration data failed capsule validation.');
    return fields;
  });
  const existing = await storage.list(ownerId);
  const keys = new Set(existing.map(demoKey));
  const created = [];
  let skipped = 0;
  for (const fields of records) {
    if (keys.has(demoKey(fields))) { skipped++; continue; }
    const record = await storage.create(ownerId, fields);
    created.push({ record, fields });
    keys.add(demoKey(fields));
  }
  const saved = await storage.list(ownerId);
  for (const { record, fields } of created) {
    const found = saved.find((row) => row.id === record.id);
    if (!found || found.user_id !== ownerId) throw new Error('Demo ownership verification failed.');
    for (const [field, value] of Object.entries(fields)) {
      if (found[field] !== (typeof value === 'boolean' ? Number(value) : value)) {
        throw new Error(`Demo read-back mismatch: ${field}`);
      }
    }
  }
  return { inserted: created.length, skipped, records: saved
    .filter((row) => records.some((record) => demoKey(record) === demoKey(row)))
    .map(({ prompt_title, category, usefulness, reviewed, improved, user_id }) => ({
      title: prompt_title, category, usefulness, reviewed: Boolean(reviewed), improved: Boolean(improved),
      ownerMatches: user_id === ownerId,
    })) };
}

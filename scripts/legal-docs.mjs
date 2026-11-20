// Writes docs/PRIVACY_POLICY.md and docs/TERMS_OF_USE.md from the same text the app shows.
// Usage: node scripts/legal-docs.mjs "Your brand" "support@yourbrand.com"
import { writeFileSync } from 'node:fs';
import { LEGAL_UPDATED, privacySections, termsSections } from '../src/legal-text.js';

const p = { name: process.argv[2] || 'Thali', supportEmail: process.argv[3] || '' };
const md = (title, sections) =>
  `# ${title}\n\n_${p.name} · Last updated ${LEGAL_UPDATED}_\n\n> Template. Have a lawyer in Bangladesh review it before launch.\n\n` +
  sections.map(([h, paras]) => `## ${h}\n\n` + (paras.length > 1 ? paras.map((x) => `- ${x}`).join('\n') : paras[0])).join('\n\n') + '\n';
writeFileSync(new URL('../docs/PRIVACY_POLICY.md', import.meta.url), md('Privacy Policy', privacySections(p)));
writeFileSync(new URL('../docs/TERMS_OF_USE.md', import.meta.url), md('Terms of Use', termsSections(p)));
console.log('Wrote docs/PRIVACY_POLICY.md and docs/TERMS_OF_USE.md');

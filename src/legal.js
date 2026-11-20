// Guest-facing Privacy Policy and Terms of Use.
// TEMPLATE: have a lawyer in Bangladesh review and adapt these before launch.
import * as A from './actions.js';
import { LEGAL_UPDATED, privacySections, termsSections } from './legal-text.js';

export function LegalPage({ kind }) {
  const p = A.platform();
  const sections = kind === 'privacy' ? privacySections(p) : termsSections(p);
  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
  return (
    <div class="legal">
      <a class="link small" href="#" onClick={(e) => { e.preventDefault(); if (history.length > 1) history.back(); else location.hash = ''; }}>← Back</a>
      <h1>{title}</h1>
      <p class="muted small">{p.name} · Last updated {LEGAL_UPDATED}</p>
      <p class="bn-sum">
        {kind === 'privacy'
          ? 'সংক্ষেপে: আপনার অর্ডার, নাম (ঐচ্ছিক), ডেলিভারির জন্য ফোন ও ঠিকানা এবং পেমেন্টের রেকর্ড শুধু অর্ডার পৌঁছে দিতে ও হিসাব রাখতে ব্যবহার হয়। আমরা তথ্য বিক্রি করি না, কার্ড নম্বর বা পিন সংরক্ষণ করি না।'
          : 'সংক্ষেপে: খাবার ও দাম রেস্টুরেন্ট নির্ধারণ করে। অ্যালার্জি থাকলে অর্ডারের আগে স্টাফকে জানান। বাতিল ও রিফান্ড রেস্টুরেন্ট দেখে। অ্যাপে "পরিশোধিত" দেখালে বিল সম্পূর্ণ।'}
      </p>
      {sections.map(([h, paras]) => (
        <section>
          <h2>{h}</h2>
          {paras.length > 1 ? <ul>{paras.map((x) => <li>{x}</li>)}</ul> : <p>{paras[0]}</p>}
        </section>
      ))}
    </div>
  );
}

'use strict';
// Presentation only: keep the existing planner mounts and request pipeline.
const EXAMPLES=[
 {photo:'/images/venues/cedarcreek-estate-winery-2610-w480.jpg',title:{en:'🍇 Wine & good food',fr:'🍇 Vin et bonne cuisine'},sub:{en:'3 days in Kelowna',fr:'3 jours à Kelowna'},request:{en:'3 days in Kelowna: wineries, easy walks and great food',fr:'3 jours à Kelowna : vignobles, promenades faciles et bonne cuisine'}},
 {photo:'/images/beaches/venues/penticton-sudbury-beach-w960.jpg',title:{en:'☀ A family weekend',fr:'☀ Un week-end en famille'},sub:{en:'2 days in Penticton',fr:'2 jours à Penticton'},request:{en:'2 days in Penticton with the kids',fr:'2 jours à Penticton avec les enfants'}},
 {photo:'/images/hiking/venues/knox-mountain-park-20261015-w480.jpg',title:{en:'🌿 A slower escape',fr:'🌿 Une escapade tranquille'},sub:{en:'Easy walks & hidden gems',fr:'Balades et trésors cachés'},request:{en:'2 relaxed days in Kelowna with easy walks and hidden gems',fr:'2 jours tranquilles à Kelowna avec des balades faciles et des trésors cachés'}}
];
function renderStart(html,d){
 const esc=d.esc,t=(en,fr)=>`<span class="t3-en">${esc(en)}</span><span class="t3-fr" lang="fr">${esc(fr)}</span>`;
 const hero=html.match(/<section class="t3-hero"[\s\S]*?<\/section>/);if(!hero)return html;
 let form=hero[0].match(/<form[\s\S]*?<\/form>/)[0];
 form=form.replace(/<label class="t3-sr"[^>]*>[\s\S]*?<\/label>/,`<label class="ts-label" for="t3Input">${t('What would your ideal trip look like?','À quoi ressemblerait votre voyage idéal ?')}</label>`);
 form=form.replace('</form>',`<p class="ts-reassure">${t('Free to plan · No sign-up needed','Planification gratuite · Sans inscription')}</p></form>`);
 const edit=hero[0].match(/<div class="t3-editbar"[\s\S]*?<\/div>/)?.[0]||'';
 const status=hero[0].match(/<p class="t3-status"[\s\S]*?<\/p>/)?.[0]||'';
 const cards=EXAMPLES.map(c=>`<button type="button" class="ts-card" data-t3-request="${esc(c.request.en)}" data-t3-request-fr="${esc(c.request.fr)}"><img src="${c.photo}" width="480" height="240" alt="" loading="lazy"><span class="ts-card-copy"><strong>${t(c.title.en,c.title.fr)}</strong><span class="ts-card-sub">${t(c.sub.en,c.sub.fr)}</span><span class="ts-card-arrow" aria-hidden="true">→</span></span></button>`).join('');
 const replacement=`<section class="t3-hero ts-start" aria-labelledby="t3Title"><div class="ts-hero"><div class="ts-copy"><p class="t3-eyebrow">${t('Build My Trip','Créer mon voyage')}</p><h1 class="t3-title" id="t3Title">${t('Your kind of Okanagan getaway.','Votre escapade dans l’Okanagan, à votre façon.')}</h1><p class="ts-lead">${t('Tell us what you love. We’ll turn it into a trip you can make your own.','Dites-nous ce que vous aimez. Nous créerons un voyage que vous pourrez personnaliser.')}</p>${form}${edit}${status}</div><picture class="ts-photo"><source media="(max-width:640px)" srcset="/images/trip-v3/hero-w800.webp"><img src="/images/trip-v3/hero-w1200.webp" width="1200" height="656" alt="${esc('Vineyards overlooking Okanagan Lake')}" fetchpriority="high"></picture></div><section class="ts-inspiration" aria-labelledby="tsInspiration"><h2 id="tsInspiration">${t('Need a little inspiration?','Besoin d’un peu d’inspiration ?')}</h2><div class="ts-cards">${cards}</div></section><ol class="ts-steps"><li><span aria-hidden="true">①</span> ${t('Tell us your idea','Décrivez votre idée')}</li><li><span aria-hidden="true">②</span> ${t('Chat to change it','Modifiez par clavardage')}</li><li><span aria-hidden="true">③</span> ${t('Save & share','Enregistrez et partagez')}</li></ol></section>`;
 html=html.replace(hero[0],replacement).replace('class="t3 t3-v4"','class="t3 t3-v4 ts-page"');
 html=html.replace(/(<section class="t3-wrap t3-about"[\s\S]*?<\/section>)/,`<details class="ts-extra"><summary>${t('More trip-planning tips & questions','Conseils et questions sur votre voyage')}</summary>$1</details>`);
 return html;
}
const START_STYLES=`<style id="trip-start-layout">
.ts-page .ts-start {background:#f7f5ee;color:#1b303c;padding:42px 32px 24px;overflow:visible;}
.ts-page .ts-hero,.ts-page .ts-inspiration,.ts-page .ts-steps {max-width:1180px;margin-left:auto;margin-right:auto;}
.ts-page .ts-hero {display:grid;grid-template-columns:1fr 1fr;gap:38px;align-items:center;}
.ts-page .ts-copy {min-width:0;}
.ts-page .t3-title {color:#1b303c;font-size:clamp(36px,4vw,54px);max-width:18ch;line-height:1.08;margin:10px 0 18px;}
.ts-page .ts-lead {font-size:18px;line-height:1.5;margin:0 0 22px;max-width:43ch;}
.ts-page .t3-composer {box-sizing:border-box;padding:22px;background:#fffdf9;border-radius:22px;box-shadow:0 4px 18px #1b303c0c;max-width:none;}
.ts-page .ts-label {display:block;font-size:18px;line-height:1.4;font-weight:800;margin-bottom:10px;}
.ts-page .t3-composer textarea {box-sizing:border-box;border:1px solid #b9c2c6;border-radius:12px;min-height:94px;padding:12px;font-size:16px;}
.ts-page .t3-composer-foot {display:block;border:0;padding-top:12px;}
.ts-page .t3-submit {width:100%;justify-content:center;border-radius:12px;font-size:17px;min-height:48px;}
.ts-page .ts-reassure {font-size:13px;text-align:center;color:#52616a;margin:12px 0 0;}
.ts-page #v4AgentHi,.ts-page .t3-hint {display:none;}
.ts-page .ts-photo {display:block;align-self:stretch;min-height:410px;position:relative;}
.ts-page .ts-photo img {position:absolute;width:100%;height:100%;object-fit:cover;border-radius:90px 90px 70px 28px;object-position:center;}
.ts-page .ts-inspiration {margin-top:30px;}
.ts-page .ts-inspiration h2 {font:600 30px/1.2 Fraunces,serif;margin:0 0 18px;}
.ts-page .ts-cards {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
.ts-page .ts-card {padding:0;display:block;overflow:hidden;border:1px solid #e2ded4;border-radius:18px;background:#fffdf9;color:#1b303c;text-align:left;cursor:pointer;box-shadow:0 3px 8px #1b303c06;}
.ts-page .ts-card:hover {border-color:#a18030;transform:translateY(-2px);}
.ts-page .ts-card img {width:100%;height:145px;object-fit:cover;display:block;}
.ts-page .ts-card-copy {display:block;position:relative;padding:12px 32px 14px 14px;}
.ts-page .ts-card strong {display:block;font:600 20px/1.25 Fraunces,serif;}
.ts-page .ts-card-sub {display:block;font-size:14px;margin-top:5px;}
.ts-page .ts-card-arrow {position:absolute;right:14px;top:22px;font-size:22px;}
.ts-page .ts-steps {display:flex;list-style:none;justify-content:space-around;gap:16px;padding:17px 24px;box-sizing:border-box;background:#e9eddf;border-radius:28px;margin-top:26px;margin-bottom:0;font-weight:800;}
.ts-page .ts-steps li {display:flex;align-items:center;gap:10px;}
.ts-page .ts-steps li>span:first-child {color:#99751c;font-size:24px;}
.ts-page #t3How,.ts-page .ts-extra {box-sizing:border-box;max-width:1180px;margin:0 auto;padding:12px 32px;background:#f7f5ee;color:#1b303c;font-size:14px;}
.ts-page #t3How summary,.ts-page .ts-extra>summary {cursor:pointer;min-height:32px;line-height:32px;}
.ts-page .ts-extra .t3-about {padding:12px 0;}
.ts-page.has-plan .ts-extra {display:none;}
.ts-page .t3-status {color:#1b303c;min-height:0;margin:10px 0 0;}
.ts-page .t3-editbar {color:#1b303c;}
@media(max-width:700px){
 .ts-page .ts-start {padding:0 16px 18px;}
 .ts-page .ts-hero {display:flex;flex-direction:column;gap:20px;}
 .ts-page .ts-photo {order:-1;width:calc(100% + 32px);min-height:148px;height:148px;margin:0 -16px;align-self:center;}
 .ts-page .ts-photo img {border-radius:0 0 32px 0;object-position:center 45%;}
 .ts-page .t3-title {font-size:34px;max-width:20ch;margin:6px 0 12px;}
 .ts-page .ts-lead {font-size:16px;line-height:1.45;margin-bottom:18px;}
 .ts-page .t3-composer {padding:16px;border-radius:18px;}
 .ts-page .ts-label {font-size:17px;}
 .ts-page .ts-inspiration {margin-top:26px;}
 .ts-page .ts-inspiration h2 {font-size:25px;}
 .ts-page .ts-cards {grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
 .ts-page .ts-card:last-child {grid-column:1/-1;}
 .ts-page .ts-card img {height:110px;}
 .ts-page .ts-card:last-child img {height:130px;}
 .ts-page .ts-card strong {font-size:17px;}
 .ts-page .ts-card-sub {font-size:12px;}
 .ts-page .ts-card-copy {padding:10px 24px 12px 10px;}
 .ts-page .ts-card-arrow {right:8px;font-size:18px;}
 .ts-page .ts-steps {flex-direction:column;gap:8px;border-radius:18px;padding:14px 18px;font-size:14px;}
 .ts-page #t3How,.ts-page .ts-extra {padding:8px 16px;}
}
</style>`;
module.exports={EXAMPLES,renderStart,START_STYLES};

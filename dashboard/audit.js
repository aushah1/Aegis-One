/* Aegis One: integrated frontend for the supplied website audit service. */
(() => {
  const api = 'http://localhost:4000/api/audits';
  const $ = id => document.getElementById(id);
  const form = $('audit-form');
  if (!form) return;
  const status = $('audit-status');
  const result = $('audit-result');
  const button = $('audit-run');
  let stream;
  const el = (tag, cls, content) => { const n = document.createElement(tag); if (cls) n.className = cls; if (content != null) n.textContent = String(content); return n; };
  function message(text) {status.textContent = text;}
  function display(a) {
    result.hidden = false;
    result.replaceChildren();
    if (a.status !== 'done' && a.status !== 'failed') {
      message('Audit in progress — ' + Object.entries(a.progress || {}).map(([k,v])=> `${k}: ${v}`).join(' · '));
      return;
    }
    button.disabled = false;
    if (stream) { stream.close(); stream = null; }
    if (a.status === 'failed') {message('Audit failed: ' + (a.error || 'Unknown error')); return;}
    message('Audit completed · ' + a.url);
    const ai = a.ai;
    if(ai) {
      const summary=el('div','audit-summary');
      summary.append(el('span','audit-pill','AI rating: ' + (ai.grade || 'N/A')),el('h2',null,ai.headline || 'Website assessment'),el('p',null,ai.summary || ''));
      result.append(summary);
    } else result.append(el('p','audit-note','AI summary unavailable. Raw checks are still shown.'));
    const grid=el('div','audit-results-grid');
    const scores=a.checks?.psi?.scores || {};
    for(const [k,v] of Object.entries(scores)){
      const card=el('div','audit-metric');card.append(el('strong',null,v == null ? '—':v),el('span',null,k.replaceAll('-',' ')));grid.append(card);
    }
    for(const k of ['headers','ssl','seo']){
      const data=a.checks?.[k];if (!data) continue;
      const card=el('div','audit-metric');card.append(el('strong',null,data.error?'!':'✓'),el('span',null,k.toUpperCase()+(data.error?': '+data.error:'')));grid.append(card);
    }
    result.append(grid);
    if (ai?.topIssues?.length){const list=el('div','audit-issues');list.append(el('h2',null,'Highest-priority fixes'));for(const issue of ai.topIssues){const card=el('article','audit-issue');card.append(el('h3',null,issue.title),el('p',null,issue.impact),el('p',null,'Suggested fix: '+(issue.fix||'')));list.append(card);}result.append(list);}
    const details=el('details','audit-summary');details.append(el('summary',null,'Technical check results'));details.append(el('pre',null,JSON.stringify(a.checks,null,2)));details.querySelector('pre').style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;';result.append(details);
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(stream)stream.close();result.hidden=true;button.disabled=true;message('Starting website audit…');
    try{
      const input=$('audit-url').value.trim();
      const url=new URL(input);if(!['http:','https:'].includes(url.protocol))throw Error('Enter an HTTP(S) website URL');
      const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url.href})});
      const payload=await res.json();if(!res.ok) throw Error(payload.error||'Could not start audit');
      stream=new EventSource(`${api}/${encodeURIComponent(payload.id)}/events`);
      stream.onmessage=e=>{try{display(JSON.parse(e.data));}catch(err){message('Could not read audit response: '+err.message);}};
      stream.onerror=()=>{message('Connection to audit service interrupted. Start a new audit after checking the backend.');button.disabled=false;stream?.close();stream=null;};
    }catch(err){message(err instanceof TypeError?'Audit service unreachable. Start MongoDB, Redis, server, and worker; see SETUP.md.':err.message);button.disabled=false;}
  });
})();

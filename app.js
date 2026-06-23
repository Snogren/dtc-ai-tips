/* AI Tips — app controller */
(function () {
  const $ = (s) => document.querySelector(s);
  const main = () => $('#main');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stars = (n) => { const f = Math.round(n||0); let s=''; for (let i=1;i<=5;i++) s += i<=f ? '★' : '<span class="off">★</span>'; return s; };

  let view = 'catalogue';
  let currentTip = null;
  let cat = [];            // cached catalogue for the sidebar

  /* ---------------- boot ---------------- */
  async function boot(){
    await DB.init();
    if (DB.mode === 'demo'){
      banner('Demo mode — sample data, sign-in disabled. Add your Supabase keys in <b>config.js</b> to go live.');
      enterApp();
    } else {
      DB.onAuth(u => { u ? enterApp() : showLogin(); });
      DB.user ? enterApp() : showLogin();
    }
    bindChrome();
  }

  function banner(html){ const b = $('#banner'); b.innerHTML = html; b.hidden = false; }
  function showLogin(){ $('#login').hidden = false; $('#app').hidden = true; }
  async function enterApp(){
    $('#login').hidden = true; $('#app').hidden = false;
    $('#who').textContent = DB.user?.email || 'demo';
    cat = await DB.catalogue();
    renderSidebar();
    go('catalogue');
  }

  /* ---------------- chrome ---------------- */
  function bindChrome(){
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#email').value.trim();
      const password = $('#password').value;
      const msg = $('#login-msg'); msg.className = 'login-msg';
      try { await DB.signIn(email, password); }
      catch { msg.textContent = 'Incorrect email or password.'; msg.classList.add('err'); }
    });
    $('#signout').addEventListener('click', async () => { await DB.signOut(); location.reload(); });
    document.querySelectorAll('[data-nav]').forEach(el =>
      el.addEventListener('click', () => go(el.dataset.nav)));
  }

  function go(v){
    view = v;
    document.querySelectorAll('.navlink').forEach(n =>
      n.classList.toggle('active', n.dataset.nav === (v==='tip'||v==='new-tip' ? 'catalogue' : v)));
    if (v === 'catalogue') renderCatalogue();
    else if (v === 'board') renderBoard();
    else if (v === 'concepts') renderConcepts();
    else if (v === 'new-tip') renderTipForm();
    renderSidebar();
    main().scrollIntoView({ block:'start' });
  }

  /* ---------------- sidebar ---------------- */
  function renderSidebar(){
    let h = '';
    cat.forEach(g => {
      h += `<div class="lbl">${esc(g.name)}</div>`;
      g.tips.forEach(t => {
        const active = view==='tip' && currentTip===t.id;
        h += `<button class="tiplink ${active?'active':''}" data-tip="${t.id}">
                <span>${esc(t.title)}</span><span class="rt">★ ${t.avg.toFixed(1)}</span></button>`;
      });
    });
    const list = $('#tiplist'); list.innerHTML = h;
    list.querySelectorAll('[data-tip]').forEach(b => b.addEventListener('click', () => openTip(b.dataset.tip)));
  }

  /* ---------------- catalogue ---------------- */
  function renderCatalogue(){
    let h = `<h2 class="cat-title">Tips</h2>
      <p class="cat-intro">A working library of prompting techniques. Pick one, try it, then rate it and leave a note on whether it held up.</p>`;
    cat.forEach(g => {
      h += `<div class="cat-group"><div class="cat-group-head"><h3>${esc(g.name)}</h3><span class="ct">${g.tips.length} tips</span></div><div class="cards">`;
      g.tips.forEach(t => {
        const you = t.you ? `you ${t.you}/5` : 'not rated';
        h += `<article class="card" data-tip="${t.id}">
                <div class="by">${esc(t.author)}</div><h4>${esc(t.title)}</h4><p>${esc(t.blurb)}</p>
                <div class="foot"><span class="avg"><span class="stars">★</span> ${t.avg.toFixed(1)} avg</span><span>${you}</span></div>
              </article>`;
      });
      h += `<div class="card add" data-nav="new-tip"><div><b>+ Add a tip</b><small>to ${esc(g.name)}</small></div></div></div></div>`;
    });
    main().innerHTML = h;
    main().querySelectorAll('[data-tip]').forEach(c => c.addEventListener('click', () => openTip(c.dataset.tip)));
    main().querySelectorAll('[data-nav="new-tip"]').forEach(c => c.addEventListener('click', () => go('new-tip')));
  }

  /* ---------------- tip view ---------------- */
  async function openTip(id){ currentTip = id; view = 'tip';
    document.querySelectorAll('.navlink').forEach(n => n.classList.toggle('active', n.dataset.nav==='catalogue'));
    main().innerHTML = '<div class="loading">Loading…</div>';
    const t = await DB.tip(id);
    if (!t){ main().innerHTML = '<p>Tip not found.</p>'; return; }
    renderTip(t); renderSidebar(); main().scrollIntoView({ block:'start' });
  }

  function renderTip(t){
    const yourLine = t.you ? `your rating <span class="stars">${stars(t.you)}</span>` : 'not yet rated';
    main().innerHTML = `
      <div class="eyebrow" data-nav="catalogue">← ${esc(t.group)}</div>
      <h2 class="tip-title">${esc(t.title)}</h2>
      <div class="tip-summary">
        <span class="rating"><span class="stars">${stars(t.avg)}</span> <b>${t.avg.toFixed(1)}</b> avg · ${t.count} ratings</span>
        <span class="dot">·</span><span>${yourLine}</span>
        <span class="dot">·</span><span>added by ${esc(t.author)}</span>
        ${t.canEdit ? '<span class="dot">·</span><span class="edit" id="editTip">edit tip</span>' : ''}
      </div>
      <div class="tip-card"><div class="tip-body">
        ${t.body.split(/\n\n+/).map(p=>`<p>${esc(p)}</p>`).join('')}
        ${t.examples.map((ex,i)=>`<div class="example"><button class="copy" data-copy="${i}" title="Copy prompt" aria-label="Copy prompt">⧉</button><span class="ex-text">${esc(ex)}</span></div>`).join('')}
      </div></div>
      <div class="mark">
        <div class="mark-hd"><span class="t">Mark this tip worked</span></div>
        <div class="mark-bd">
          <div class="rrow"><label>Your rating</label>
            <div class="rate" id="rate" data-set="${t.you||0}">
              <span data-v="1">★</span><span data-v="2">★</span><span data-v="3">★</span><span data-v="4">★</span><span data-v="5">★</span>
            </div></div>
          <textarea id="note" placeholder="Did this tip hold up for you? (visible below)">${esc(t.yourComment||'')}</textarea>
          <div class="mark-actions"><span class="note" id="markmsg">you can edit this anytime</span>
            <div class="btns"><button class="btn ghost" id="saveBtn">Save</button><button class="btn primary" id="learnBtn">Mark learned</button></div>
          </div>
        </div>
      </div>
      <div class="statements">
        <h4>Notes <span class="n">${t.comments.length}</span></h4>
        ${t.comments.length ? t.comments.map(c=>`
          <div class="stmt"><div class="top"><span class="name">${esc(c.name)} <span class="stars">${stars(c.rating)}</span></span>
            <span class="date">${esc(c.date)}${c.mine?` · <button class="linkbtn cmt-edit">edit</button> · <button class="linkbtn cmt-del">delete</button>`:''}</span></div>
            <p>${esc(c.text)}</p></div>`).join('')
          : '<div class="empty">No notes yet — be the first to mark this tip worked.</div>'}
      </div>`;
    main().querySelector('.eyebrow').addEventListener('click', () => go('catalogue'));
    if (t.canEdit) main().querySelector('#editTip').addEventListener('click', () => editTip(t.id));
    main().querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyText(t.examples[+b.dataset.copy], b)));
    main().querySelectorAll('.cmt-edit').forEach(b => b.addEventListener('click', () => {
      const n = $('#note'); n.scrollIntoView({ block:'center' }); n.focus();
    }));
    main().querySelectorAll('.cmt-del').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete your note? Your rating will stay.')) return;
      try { await DB.deleteComment(t.id); cat = await DB.catalogue(); openTip(t.id); }
      catch { const m = $('#markmsg'); if (m) m.textContent = 'Could not delete the note.'; }
    }));
    bindRate(t.id);
  }

  async function copyText(text, btn){
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove(); }
    if (btn){ const prev = btn.textContent; btn.textContent = '✓'; btn.classList.add('ok'); setTimeout(()=>{ btn.textContent = prev; btn.classList.remove('ok'); }, 1100); }
  }

  function bindRate(tipId){
    const rate = $('#rate');
    const paint = v => rate.querySelectorAll('span').forEach(s => s.classList.toggle('lit', s.dataset.v <= v));
    rate.querySelectorAll('span').forEach(s => {
      s.addEventListener('mouseenter', () => paint(s.dataset.v));
      s.addEventListener('click', () => { rate.dataset.set = s.dataset.v; paint(s.dataset.v); });
    });
    rate.addEventListener('mouseleave', () => paint(rate.dataset.set || 0));
    paint(rate.dataset.set || 0);

    const save = async (requireNote) => {
      const rating = parseInt(rate.dataset.set || '0', 10);
      const comment = $('#note').value.trim();
      const msg = $('#markmsg');
      if (!rating){ msg.textContent = 'Pick a rating first.'; return; }
      if (requireNote && !comment){ msg.textContent = 'Add a note to mark it learned.'; return; }
      try {
        await DB.saveRating(tipId, rating, comment);
        cat = await DB.catalogue();          // refresh averages
        await openTip(tipId);
      } catch { msg.textContent = 'Could not save — check your connection / access.'; }
    };
    $('#saveBtn').addEventListener('click', () => save(false));
    $('#learnBtn').addEventListener('click', () => save(true));
  }

  /* ---------------- add / edit tip ---------------- */
  const exampleRow = (val) => `<div class="ex-row">
      <textarea class="f-example" placeholder="A prompt someone can paste.">${esc(val||'')}</textarea>
      <button type="button" class="btn ghost ex-rm" title="Remove example" aria-label="Remove example">✕</button>
    </div>`;

  // Load a tip, then open the form pre-filled for editing.
  async function editTip(id){
    view = 'edit-tip';
    document.querySelectorAll('.navlink').forEach(n => n.classList.toggle('active', n.dataset.nav==='catalogue'));
    main().innerHTML = '<div class="loading">Loading…</div>';
    const t = await DB.tip(id);
    if (!t){ main().innerHTML = '<p>Tip not found.</p>'; return; }
    renderTipForm(t);
  }

  // existing == null → create; existing == tip object → edit
  async function renderTipForm(existing){
    const groups = await DB.groups();
    const demo = DB.mode === 'demo';
    const editing = !!existing;
    const exs = editing && existing.examples?.length ? existing.examples : [''];
    main().innerHTML = `
      <div class="eyebrow" data-nav="back">← ${editing ? esc(existing.title) : 'Tips'}</div>
      <h2 class="form-title">${editing ? 'Edit tip' : 'Add a tip'}</h2>
      ${demo ? `<p class="cat-intro">Demo mode is read-only — connect Supabase to save ${editing?'changes':'new tips'}.</p>` : ''}
      <div class="field"><label>Group</label>
        <select id="f-group">${groups.map(g=>`<option value="${g.id}" ${editing && g.id===existing.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}
          <option value="__new">➕ New group…</option></select></div>
      <div class="field" id="newgroup-wrap" hidden><label>New group name</label><input id="f-newgroup" placeholder="e.g. Reasoning"></div>
      <div class="field"><label>Title</label><input id="f-title" value="${esc(editing?existing.title:'')}" placeholder="Set a word limit"></div>
      <div class="field"><label>What to do & why</label><textarea id="f-body" style="min-height:140px" placeholder="One or two short paragraphs.">${esc(editing?existing.body:'')}</textarea>
        <div class="hint">Blank line between paragraphs.</div></div>
      <div class="field"><label>Example prompts</label>
        <div id="examples">${exs.map(exampleRow).join('')}</div>
        <button type="button" class="btn ghost" id="addEx" style="margin-top:8px">+ Add another example</button></div>
      <div class="form-actions">
        <button class="btn ghost" data-nav="back">Cancel</button>
        <button class="btn primary" id="saveTipBtn" ${demo?'disabled style="opacity:.5;cursor:not-allowed"':''}>${editing?'Save changes':'Create tip'}</button>
      </div>
      <p class="login-msg" id="formmsg"></p>`;
    const back = () => editing ? openTip(existing.id) : go('catalogue');
    main().querySelectorAll('[data-nav="back"]').forEach(b => b.addEventListener('click', back));
    const sel = $('#f-group');
    const syncNewGroup = () => { $('#newgroup-wrap').hidden = sel.value !== '__new'; };
    sel.addEventListener('change', syncNewGroup);
    syncNewGroup();   // show the name input immediately when "New group…" is the default (e.g. no groups yet)
    const exWrap = $('#examples');
    const bindRm = () => exWrap.querySelectorAll('.ex-rm').forEach(b => b.onclick = () => {
      if (exWrap.querySelectorAll('.ex-row').length > 1) b.closest('.ex-row').remove();
      else b.closest('.ex-row').querySelector('.f-example').value = '';   // keep at least one row
    });
    bindRm();
    $('#addEx').addEventListener('click', () => { exWrap.insertAdjacentHTML('beforeend', exampleRow('')); bindRm(); });
    if (!demo) $('#saveTipBtn').addEventListener('click', () => submitTip(existing));
  }

  async function submitTip(existing){
    const msg = $('#formmsg'); msg.className = 'login-msg';
    const title = $('#f-title').value.trim(), body = $('#f-body').value.trim();
    const examples = [...document.querySelectorAll('#examples .f-example')].map(t => t.value.trim()).filter(Boolean);
    if (!title || !body){ msg.textContent = 'Title and body are required.'; msg.classList.add('err'); return; }
    try {
      let groupId = $('#f-group').value;
      if (groupId === '__new'){
        const name = $('#f-newgroup').value.trim();
        if (!name){ msg.textContent = 'Name the new group.'; msg.classList.add('err'); return; }
        groupId = await DB.createGroup(name);
      }
      let id;
      if (existing){ await DB.updateTip({ id:existing.id, groupId, title, body, examples }); id = existing.id; }
      else { id = await DB.createTip({ groupId, title, body, examples }); }
      cat = await DB.catalogue();
      openTip(id);
    } catch { msg.textContent = `Could not ${existing?'save':'create'} the tip — check your access.`; msg.classList.add('err'); }
  }

  /* ---------------- leaderboard ---------------- */
  async function renderBoard(){
    main().innerHTML = '<div class="loading">Loading…</div>';
    const lb = await DB.leaderboard();
    const rows = (arr, suffix) => arr.length ? arr.map((r,i)=>`
      <div class="row"><span class="rk">${i+1}</span><span class="who"><b>${esc(r.name)}</b></span><span class="sc">${r.score}</span></div>`).join('')
      : `<div class="row"><span class="rk"></span><span class="who"><small>No data yet</small></span><span class="sc"></span></div>`;
    main().innerHTML = `
      <h2 class="lb-title">Leaderboard</h2>
      <p class="lb-intro">Who is learning and contributing most, and which tips are rated highest.</p>
      <div class="lb">
        <div class="panel"><h3>Most tips learned</h3>${rows(lb.learned)}</div>
        <div class="panel"><h3>Most tips added</h3>${rows(lb.added)}</div>
      </div>
      <p class="lb-sec">Highest-rated tips</p>
      <div class="panel">${lb.topRated.length ? lb.topRated.map(t=>`
        <div class="toptip" data-tip="${t.id}"><div class="q">${esc(t.title)}</div>
          <div class="m"><span>${esc(t.group)}</span><span><b>${t.avg.toFixed(1)}</b> · ${t.count} ratings</span></div></div>`).join('')
        : '<div class="row"><span class="who"><small>No rated tips yet</small></span></div>'}</div>`;
    main().querySelectorAll('[data-tip]').forEach(c => c.addEventListener('click', () => openTip(c.dataset.tip)));
  }

  /* ---------------- concepts (static markdown) ---------------- */
  async function renderConcepts(){
    main().innerHTML = '<div class="loading">Loading…</div>';
    try {
      const md = await (await fetch('concepts.md')).text();
      main().innerHTML = `<div class="concepts">${window.marked ? marked.parse(md) : '<pre>'+esc(md)+'</pre>'}</div>`;
    } catch {
      main().innerHTML = `<div class="concepts"><h1>How AI works</h1>
        <p>The concepts page loads <code>concepts.md</code>. Browsers block that over <code>file://</code> — serve the folder (e.g. <code>npx serve</code>) or deploy to GitHub Pages and it will render.</p></div>`;
    }
  }

  boot();
})();

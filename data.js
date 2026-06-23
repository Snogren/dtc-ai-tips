/* Data layer: Supabase when configured, else read/write-light DEMO sample data. */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = !!(cfg.url && cfg.anonKey && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' :
    d.getFullYear() + '·' + String(d.getMonth()+1).padStart(2,'0') + '·' + String(d.getDate()).padStart(2,'0'); };
  const blurbOf = (body) => { const s = (body||'').split(/(?<=[.!?])\s/)[0] || body || ''; return s.length > 95 ? s.slice(0,92)+'…' : s; };
  const agg = (rs) => { const c = rs.length; return { count: c, avg: c ? rs.reduce((a,r)=>a+r.rating,0)/c : 0 }; };
  // Normalize examples: prefer the `examples` array; fall back to the legacy single `example` column.
  const examplesOf = (row) => {
    const arr = Array.isArray(row.examples) ? row.examples : [];
    const clean = arr.map(s => String(s ?? '').trim()).filter(Boolean);
    if (clean.length) return clean;
    const one = (row.example || '').trim();
    return one ? [one] : [];
  };

  /* ---------------- DEMO sample data ---------------- */
  const SAMPLE = [
    { id:'g1', name:'Format & Structure', tips:[
      { id:'word-limit', title:'Set a word limit', author:'N. Snogren', authorId:'nick',
        body:'State the length you want before the model gets a chance to ramble. "Three bullets." "Under eighty words." It is the smallest instruction with the largest visible return — the reply lands faster and you read it faster.\n\nA language model continues the pattern your prompt starts, one token at a time. Give it the shape of the ending and you have removed a whole dimension of guesswork.',
        examples:['Summarize this report in 5 bullets, max 80 words.','Reply in one sentence — under 25 words. No preamble.'],
        ratings:[ {user:'md',name:'M. Delgado',rating:5,comment:'Changed how I draft email. Cap at 60 words, expand only the lines that get pushback.',date:'2026-06-12'},
                  {user:'tk',name:'T. Keller',rating:4,comment:'For analysis I add a floor: "at least 200 words, then a 1-line verdict," or it clips reasoning I wanted.',date:'2026-06-08'} ] },
      { id:'specify-output', title:'Specify the output', author:'N. Snogren', authorId:'nick',
        body:'Name the exact container you want back — a table, a bulleted list, an email, JSON. Naming the format saves you reformatting later and makes several answers directly comparable.',
        example:'Compare these 3 vendors as a table: name, cost, risk, recommendation.',
        ratings:[ {user:'ar',name:'A. Reyes',rating:4,comment:'Asking for JSON with named keys made it trivial to drop straight into a sheet.',date:'2026-06-02'} ] },
      { id:'clear-direct', title:'Clear, specific, direct', author:'N. Snogren', authorId:'nick',
        body:'Say exactly what you want, who it is for, and what to avoid. Vague prompts get vague answers; the model fills ambiguity with the average of everything it has seen.',
        example:'Write a 2-line email declining the vendor quote — polite, no reason given.', ratings:[] } ]},
    { id:'g2', name:'Context & Persona', tips:[
      { id:'front-load', title:'Front-load the situation', author:'N. Snogren', authorId:'nick',
        body:'Open with your situation before the ask. Every detail of who, what, and why shifts the probabilities behind each token the model generates.',
        example:"I'm a {role} doing {task} to achieve {goal} for {stakeholders}. Draft…",
        ratings:[ {user:'md',name:'M. Delgado',rating:5,comment:'One line of context did more than three rounds of follow-up corrections used to.',date:'2026-06-10'} ] },
      { id:'upload', title:'Upload the evidence', author:'J. Okafor', authorId:'jo',
        body:'Screenshot the screen, paste the contract, attach the spreadsheet. It reads images, code, and tables directly — often faster than describing them.',
        example:"Here's a screenshot of my Power BI screen — walk me through the next step.", ratings:[] } ]},
    { id:'g3', name:'Variety', tips:[
      { id:'options', title:'Ask for many options', author:'N. Snogren', authorId:'nick',
        body:"Ask for several independent answers at once and have it show the probability of each. Verbalized sampling broadens the range and sidesteps the model's default, most-likely response.",
        example:'Give 5 independent responses, each from a different persona. Show probability in X.X format.',
        ratings:[ {user:'tk',name:'T. Keller',rating:5,comment:'Underrated. The low-probability options are where the genuinely fresh ideas hide.',date:'2026-05-28'} ] } ]}
  ];
  const DEMO_KEY = 'aitips_demo_ratings';
  const demoStore = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)||'{}'); } catch { return {}; } };
  const demoSave = (s) => localStorage.setItem(DEMO_KEY, JSON.stringify(s));
  const demoTips = () => SAMPLE.flatMap(g => g.tips.map(t => ({...t, groupId:g.id, group:g.name})));
  function demoRatings(tip){ // merge your demo rating over sample
    const mine = demoStore()[tip.id];
    const base = tip.ratings.filter(r => r.user !== 'you');
    return mine ? [...base, {user:'you',name:'You',rating:mine.rating,comment:mine.comment,date:mine.date}] : base;
  }

  /* feedback (demo): a single-user thread store in localStorage. The demo user
     is 'you' (a member, never admin), so only their own threads exist. */
  const FB_KEY = 'aitips_demo_feedback';
  const fbStore = () => { try { return JSON.parse(localStorage.getItem(FB_KEY)||'{}'); } catch { return {}; } };
  const fbSave = (s) => localStorage.setItem(FB_KEY, JSON.stringify(s));
  const fbState = () => { const s = fbStore(); return { subs: s.subs || [], reads: s.reads || {} }; };

  /* ---------------- public API ---------------- */
  const DB = {
    configured, mode: configured ? 'live' : 'demo', user: null, isAdmin: false,

    async init(){
      if (sb){
        const { data } = await sb.auth.getSession();
        this.user = data.session?.user || null;
        await this.loadAdmin();
      }
    },
    // Whether the signed-in user is an admin (drives the feedback inbox / status UI).
    // RLS is the real gate; this only decides what to render.
    async loadAdmin(){
      if (!sb || !this.user){ this.isAdmin = false; return; }
      const { data } = await sb.from('profiles').select('is_admin').eq('id', this.user.id).single();
      this.isAdmin = !!data?.is_admin;
    },
    onAuth(cb){
      if (!sb) return;
      // Supabase fires onAuthStateChange on tab focus (TOKEN_REFRESHED) — keep `user` fresh,
      // but only notify the app when the signed-in identity actually changes, so the current
      // view (e.g. an open tip) isn't reset to the catalogue every time you switch windows.
      let lastId = this.user?.id ?? null;
      sb.auth.onAuthStateChange(async (_e, session) => {
        const u = session?.user || null;
        this.user = u;
        const id = u?.id ?? null;
        if (id === lastId) return;
        lastId = id;
        await this.loadAdmin();
        cb(u);
      });
    },
    async signIn(email, password){
      if (!sb) throw new Error('demo');
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    // Self-service signup. The DB trigger rejects unapproved domains, so an
    // off-domain email throws here — surfaced to the user as a generic error.
    async signUp(email, password){
      if (!sb) throw new Error('demo');
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
    },
    async signOut(){ if (sb) await sb.auth.signOut(); this.user = null; },

    async catalogue(){
      if (!sb){
        return SAMPLE.map(g => ({ id:g.id, name:g.name, tips: g.tips.map(t => {
          const rs = demoRatings(t); const a = agg(rs); const you = rs.find(r=>r.user==='you');
          return { id:t.id, title:t.title, blurb:blurbOf(t.body), author:t.author, avg:a.avg, count:a.count, you: you?you.rating:null };
        })}));
      }
      const yourId = this.user?.id;
      const [{ data:groups }, { data:tips }, { data:ratings }] = await Promise.all([
        sb.from('groups').select('id,name,position').order('position'),
        sb.from('tips').select('id,group_id,title,body,author_id, profiles(display_name)'),
        sb.from('ratings').select('tip_id,user_id,rating')
      ]);
      return (groups||[]).map(g => ({ id:g.id, name:g.name, tips:(tips||[]).filter(t=>t.group_id===g.id).map(t=>{
        const rs = (ratings||[]).filter(r=>r.tip_id===t.id); const a = agg(rs);
        const mine = rs.find(r=>r.user_id===yourId);
        return { id:t.id, title:t.title, blurb:blurbOf(t.body), author:t.profiles?.display_name||'—', avg:a.avg, count:a.count, you: mine?mine.rating:null };
      })}));
    },

    async tip(id){
      if (!sb){
        const t = demoTips().find(x=>x.id===id); if (!t) return null;
        const rs = demoRatings(t); const a = agg(rs); const mine = rs.find(r=>r.user==='you');
        return { id:t.id, title:t.title, body:t.body, examples:examplesOf(t), group:t.group, groupId:t.groupId,
          author:t.author, avg:a.avg, count:a.count, you: mine?mine.rating:null, yourComment: mine?mine.comment:'',
          canEdit: false,
          comments: rs.filter(r=>r.comment).map(r=>({ name:r.name, rating:r.rating, date:r.date, text:r.comment, mine:r.user==='you' })) };
      }
      const yourId = this.user?.id;
      const { data:t } = await sb.from('tips').select('id,title,body,example,examples,group_id,author_id, groups(name), profiles(display_name)').eq('id',id).single();
      if (!t) return null;
      const { data:rs } = await sb.from('ratings').select('rating,comment,updated_at,user_id, profiles(display_name)').eq('tip_id',id).order('updated_at',{ascending:false});
      const a = agg(rs||[]); const mine = (rs||[]).find(r=>r.user_id===yourId);
      return { id:t.id, title:t.title, body:t.body, examples:examplesOf(t), group:t.groups?.name||'', groupId:t.group_id,
        author:t.profiles?.display_name||'—', avg:a.avg, count:a.count,
        you: mine?mine.rating:null, yourComment: mine?(mine.comment||''):'',
        canEdit: t.author_id===yourId,
        comments: (rs||[]).filter(r=>r.comment && r.comment.trim()).map(r=>({ name:r.profiles?.display_name||'—', rating:r.rating, date:fmtDate(r.updated_at), text:r.comment, mine:r.user_id===yourId })) };
    },

    async saveRating(tipId, rating, comment){
      if (!sb){ const s = demoStore(); s[tipId] = { rating, comment, date: new Date().toISOString().slice(0,10) }; demoSave(s); return; }
      const { error } = await sb.from('ratings').upsert(
        { tip_id:tipId, user_id:this.user.id, rating, comment, updated_at:new Date().toISOString() },
        { onConflict:'tip_id,user_id' });
      if (error) throw error;
    },

    async groups(){
      if (!sb) return SAMPLE.map(g=>({id:g.id,name:g.name}));
      const { data } = await sb.from('groups').select('id,name').order('position'); return data||[];
    },
    async createGroup(name){
      if (!sb) throw new Error('demo');
      const { data, error } = await sb.from('groups').insert({ name, author_id:this.user.id }).select('id').single();
      if (error) throw error; return data.id;
    },
    async createTip({ groupId, title, body, examples }){
      if (!sb) throw new Error('demo');
      const { data, error } = await sb.from('tips').insert({ group_id:groupId, title, body, examples: examples||[], author_id:this.user.id }).select('id').single();
      if (error) throw error; return data.id;
    },
    async updateTip({ id, groupId, title, body, examples }){
      if (!sb) throw new Error('demo');
      const { error } = await sb.from('tips').update({ group_id:groupId, title, body, examples: examples||[] }).eq('id',id).eq('author_id',this.user.id);
      if (error) throw error;
    },
    // Clear your note while keeping your rating. Demo persists to localStorage like saveRating.
    async deleteComment(tipId){
      if (!sb){ const s = demoStore(); if (s[tipId]){ s[tipId].comment = ''; demoSave(s); } return; }
      const { error } = await sb.from('ratings').update({ comment:null, updated_at:new Date().toISOString() }).eq('tip_id',tipId).eq('user_id',this.user.id);
      if (error) throw error;
    },

    async leaderboard(){
      if (!sb){
        const tips = demoTips();
        const learned = {}, names = {};
        tips.forEach(t => demoRatings(t).forEach(r => { learned[r.user]=(learned[r.user]||0)+1; names[r.user]=r.name; }));
        const added = {}; tips.forEach(t => { added[t.authorId]=(added[t.authorId]||0)+1; names[t.authorId]=t.author; });
        const topRated = tips.map(t=>{ const a=agg(demoRatings(t)); return {title:t.title,group:t.group,avg:a.avg,count:a.count,id:t.id}; });
        return {
          learned: Object.entries(learned).map(([u,n])=>({name:names[u],score:n})).sort((a,b)=>b.score-a.score),
          added:   Object.entries(added).map(([u,n])=>({name:names[u],score:n})).sort((a,b)=>b.score-a.score),
          topRated: topRated.sort((a,b)=>b.avg-a.avg).slice(0,5)
        };
      }
      const [{ data:profiles }, { data:tips }, { data:ratings }] = await Promise.all([
        sb.from('profiles').select('id,display_name,is_admin'),
        sb.from('tips').select('id,title,author_id, groups(name)'),
        sb.from('ratings').select('tip_id,user_id,rating')
      ]);
      const nameOf = id => (profiles||[]).find(p=>p.id===id)?.display_name || '—';
      const adminOf = id => (profiles||[]).find(p=>p.id===id)?.is_admin;
      const learned = {}; (ratings||[]).forEach(r => { if(!adminOf(r.user_id)) learned[r.user_id]=(learned[r.user_id]||0)+1; });
      const added = {};   (tips||[]).forEach(t => { if(!adminOf(t.author_id)) added[t.author_id]=(added[t.author_id]||0)+1; });
      const topRated = (tips||[]).map(t=>{ const rs=(ratings||[]).filter(r=>r.tip_id===t.id); const a=agg(rs);
        return { id:t.id, title:t.title, group:t.groups?.name||'', avg:a.avg, count:a.count }; });
      return {
        learned: Object.entries(learned).map(([u,n])=>({name:nameOf(u),score:n})).sort((a,b)=>b.score-a.score).slice(0,8),
        added:   Object.entries(added).map(([u,n])=>({name:nameOf(u),score:n})).sort((a,b)=>b.score-a.score).slice(0,8),
        topRated: topRated.filter(t=>t.count>0).sort((a,b)=>b.avg-a.avg).slice(0,5)
      };
    },

    /* ---------------- feedback channel ---------------- */
    // A thread is "unseen" when its newest message is from the other party
    // and is newer than this user's read marker.
    async submissions(){
      if (!sb){
        const { subs, reads } = fbState();
        return subs.map(s => {
          const last = s.messages[s.messages.length-1];
          const seen = reads[s.id];
          return { id:s.id, type:s.type, subject:s.subject, status:s.status,
            author:'You', authorId:'you', createdAt:s.createdAt, updatedAt:last?.at||s.createdAt,
            messageCount:s.messages.length, lastMessageAt:last?.at||s.createdAt,
            unseen: !!last && last.author!=='you' && (!seen || last.at>seen) };
        }).sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''));
      }
      const me = this.user?.id;
      const [{ data:subs }, { data:msgs }, { data:reads }] = await Promise.all([
        sb.from('submissions').select('id,type,subject,status,author_id,created_at,updated_at, profiles(display_name)'),
        sb.from('submission_messages').select('submission_id,author_id,created_at'),
        sb.from('submission_reads').select('submission_id,last_read_at').eq('user_id', me)
      ]);
      const readAt = {}; (reads||[]).forEach(r => readAt[r.submission_id]=r.last_read_at);
      return (subs||[]).map(s => {
        const m = (msgs||[]).filter(x=>x.submission_id===s.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
        const last = m[m.length-1]; const seen = readAt[s.id];
        return { id:s.id, type:s.type, subject:s.subject, status:s.status,
          author:s.profiles?.display_name||'—', authorId:s.author_id, createdAt:s.created_at, updatedAt:s.updated_at,
          messageCount:m.length, lastMessageAt:last?.created_at||s.created_at,
          unseen: !!last && last.author_id!==me && (!seen || last.created_at>seen) };
      }).sort((a,b)=> (b.updatedAt||'').localeCompare(a.updatedAt||''));
    },

    async submission(id){
      if (!sb){
        const { subs } = fbState(); const s = subs.find(x=>x.id===id); if (!s) return null;
        return { id:s.id, type:s.type, subject:s.subject, status:s.status, author:'You', authorId:'you',
          canSetStatus:false, mine:true,
          messages: s.messages.map(m => ({ name: m.author==='you'?'You':'Program', mine:m.author==='you',
            isAdmin:m.author==='admin', body:m.body, date:fmtDate(m.at) })) };
      }
      const me = this.user?.id;
      const { data:s } = await sb.from('submissions').select('id,type,subject,status,author_id, profiles(display_name)').eq('id',id).single();
      if (!s) return null;
      const { data:msgs } = await sb.from('submission_messages')
        .select('body,created_at,author_id, profiles(display_name,is_admin)').eq('submission_id',id).order('created_at');
      return { id:s.id, type:s.type, subject:s.subject, status:s.status,
        author:s.profiles?.display_name||'—', authorId:s.author_id,
        canSetStatus:this.isAdmin, mine:s.author_id===me,
        messages: (msgs||[]).map(m => ({ name:m.profiles?.display_name||'—', mine:m.author_id===me,
          isAdmin:!!m.profiles?.is_admin, body:m.body, date:fmtDate(m.created_at) })) };
    },

    async createSubmission({ type, subject, body }){
      if (!sb){
        const st = fbStore(); const subs = st.subs || [];
        const id = 'fb'+Date.now(); const at = new Date().toISOString();
        subs.push({ id, type, subject, status:'open', createdAt:at, messages:[{ author:'you', body, at }] });
        st.subs = subs; st.reads = st.reads || {}; st.reads[id] = at; fbSave(st);
        return id;
      }
      const { data, error } = await sb.from('submissions')
        .insert({ author_id:this.user.id, type, subject }).select('id').single();
      if (error) throw error;
      const { error:mErr } = await sb.from('submission_messages')
        .insert({ submission_id:data.id, author_id:this.user.id, body });
      if (mErr) throw mErr;
      await this.markRead(data.id);
      return data.id;
    },

    async reply(id, body){
      if (!sb){
        const st = fbStore(); const s = (st.subs||[]).find(x=>x.id===id); if (!s) throw new Error('missing');
        const at = new Date().toISOString();
        s.messages.push({ author:'you', body, at });
        st.reads = st.reads || {}; st.reads[id] = at; fbSave(st);
        return;
      }
      const { error } = await sb.from('submission_messages')
        .insert({ submission_id:id, author_id:this.user.id, body });
      if (error) throw error;
      await this.markRead(id);
    },

    async setStatus(id, status){
      if (!sb) throw new Error('demo');
      const { error } = await sb.from('submissions').update({ status }).eq('id', id);
      if (error) throw error;
    },

    // Mark a thread read up to now, so its unseen flag clears.
    async markRead(id){
      if (!sb){ const st = fbStore(); st.reads = st.reads || {}; st.reads[id] = new Date().toISOString(); fbSave(st); return; }
      await sb.from('submission_reads')
        .upsert({ submission_id:id, user_id:this.user.id, last_read_at:new Date().toISOString() },
          { onConflict:'submission_id,user_id' });
    }
  };
  window.DB = DB;
})();

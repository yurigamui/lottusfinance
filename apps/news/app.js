const SB_URL="https://rowhslnnlzfbhmzbylbz.supabase.co";
const SB_KEY="sb_publishable_G_2ClQ5DpzaAn_02yahsfQ_FwSFR5eQ";
const ORIGIN="https://news.lottusfinance.com.br";
const NCATS=["Brasil","Exterior","Cripto","Empresas","Macro","Commodities"];
const STALE_DAYS=120;
const TZ="America/Sao_Paulo";
const $=document.getElementById("app");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=u=>/^https?:\/\//i.test(u)?u:"#";
const fmt=(d,long)=>new Date(d).toLocaleString("pt-BR",long?{dateStyle:"long",timeStyle:"short",timeZone:TZ}:{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:TZ});
const fmtDay=d=>{const[y,m,dd]=String(d).split("-");return `${dd}/${m}/${y}`};
const fmtDayShort=d=>{const[y,m,dd]=String(d).split("-");return `${dd}/${m}`};
const ago=d=>{const m=Math.round((Date.now()-new Date(d))/6e4);if(m<1)return"agora";if(m<60)return`há ${m} min`;const h=Math.round(m/60);if(h<24)return`há ${h} h`;const dd=Math.round(h/24);return dd===1?"ontem":`há ${dd} dias`};
document.getElementById("yr").textContent=new Date().getFullYear();
async function rpc(fn,body){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(body||{})});
  if(!r.ok)throw new Error("HTTP "+r.status);
  return r.json();
}
const labCls=l=>/^Reportado/.test(l)?"Reportado":/^Leitura/.test(l)?"Leitura":"Hipótese";
const lab=l=>l?`<span class="lab ${labCls(l)}">${esc(l)}</span>`:"";
const tickers=a=>(a||[]).map(t=>`<span class="tk">${esc(t)}</span>`).join("");
const toneCls=t=>["up","down","neutral"].includes(t)?t:"neutral";
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("on");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("on"),2200)}
function setMeta(title,desc,path){
  document.title=title;
  const set=(sel,v)=>{const e=document.querySelector(sel);if(e)e.setAttribute("content",v)};
  set('meta[name=description]',desc);set('meta[property="og:title"]',title);set('meta[property="og:description"]',desc);
  document.querySelector('link[rel=canonical]').setAttribute("href",ORIGIN+(path||"/"));
}
function renderNav(active){
  document.getElementById("nav").innerHTML=[["prev","Previsões","/"],["not","Notícias","/noticias"]].map(([k,n,h])=>`<a href="${h}"${k===active?' aria-current="true"':""}>${n}</a>`).join("");
}
const dateOk=s=>s&&!isNaN(new Date(s));
const skeletonGrid=n=>`<div class="grid">${Array(n).fill('<div class="card ind"><div class="sk" style="height:16px;width:70%"></div><div class="sk" style="height:38px;margin:16px 0"></div><div class="sk" style="height:30px"></div></div>').join("")}</div>`;
const errBox=()=>`<div class="card msg"><h2>Não foi possível carregar agora</h2><p>Verifique a conexão e tente de novo.</p><button class="btn" id="retry">Tentar novamente</button></div>`;

/* ---------- previsões: dados e cálculos ---------- */
let FC=null;
async function loadFC(){if(!FC){FC=await rpc("news_forecasts")}return FC}
const daysSince=d=>Math.floor((Date.now()-new Date(d+"T12:00:00-03:00"))/864e5);
const isStale=f=>daysSince(f.as_of)>STALE_DAYS;
const isHouse=f=>["banco","casa de análise","agência"].includes(f.kind);
const catsWithInd=()=>[...new Set(FC.indicators.map(i=>i.category))];
function fv(ind,v){return `${ind.prefix}${Number(v).toLocaleString("pt-BR",{minimumFractionDigits:ind.decimals,maximumFractionDigits:ind.decimals})}${ind.suffix}`}
function fdelta(ind,d){
  const s=d>0?"+":d<0?"−":"";const a=Math.abs(d);
  if(ind.suffix==="%")return `${s}${a.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} p.p.`;
  return `${s}${ind.prefix}${a.toLocaleString("pt-BR",{minimumFractionDigits:ind.decimals,maximumFractionDigits:ind.decimals})}${ind.suffix}`;
}
function calc(ind){
  const all=FC.forecasts.filter(f=>f.indicator===ind.key).map(f=>({...f,value:Number(f.value),prior_value:f.prior_value==null?null:Number(f.prior_value)}));
  const active=all.filter(f=>!isStale(f));
  const houses=active.filter(isHouse);
  const focus=active.find(f=>f.kind==="consenso")||null;
  const mean=houses.length?houses.reduce((s,f)=>s+f.value,0)/houses.length:null;
  const vals=active.filter(f=>f.kind!=="mercado de previsão").map(f=>f.value);
  const min=vals.length?Math.min(...vals):null,max=vals.length?Math.max(...vals):null;
  const up=active.filter(f=>f.prior_value!=null&&f.value>f.prior_value).length;
  const down=active.filter(f=>f.prior_value!=null&&f.value<f.prior_value).length;
  const last=all.reduce((m,f)=>f.as_of>m?f.as_of:m,"0000");
  return{all,active,houses,focus,mean,min,max,up,down,last};
}
function pos(v,lo,hi){if(hi===lo)return 50;return 4+(v-lo)/(hi-lo)*92}
function mainLabel(ind,s){
  if(s.houses.length>=2)return{v:fv(ind,s.mean),l:`Média de ${s.houses.length} casas`};
  if(s.houses.length===1)return{v:fv(ind,s.houses[0].value),l:`Única casa com dado recente: ${esc(s.houses[0].house)}`};
  if(s.focus)return{v:fv(ind,s.focus.value),l:"Só o consenso do Focus"};
  return{v:"—",l:"Sem projeção recente"};
}
function indCard(ind,s){
  const m=mainLabel(ind,s);
  const lo=s.min,hi=s.max;
  const dots=lo==null?"":s.active.filter(f=>f.kind!=="mercado de previsão"&&f.kind!=="consenso").map(f=>`<i style="left:${pos(f.value,lo,hi)}%" title="${esc(f.house)}: ${esc(fv(ind,f.value))}"></i>`).join("")
    +(s.focus?`<i class="focus" style="left:${pos(s.focus.value,lo,hi)}%" title="Focus: ${esc(fv(ind,s.focus.value))}"></i>`:"")
    +(s.houses.length>=2?`<i class="avg" style="left:${pos(s.mean,lo,hi)}%" title="Média"></i>`:"");
  const rev=(s.up||s.down)?`${s.up?`<b>▲ ${s.up}</b> elevaram`:""}${s.up&&s.down?" · ":""}${s.down?`<b>▼ ${s.down}</b> reduziram`:""}`:"Sem revisões";
  return `<a class="card ind" href="/previsoes/${esc(ind.key)}"><div class="top"><div><div class="kick">${esc(ind.category)}</div><h3>${esc(ind.name)}</h3></div><span class="badge">${esc(ind.horizon)}</span></div>
<div class="big">${m.v}</div><div class="sub">${m.l}</div>
${lo!=null?`<div class="rng" aria-hidden="true">${dots}</div><div class="rnglab"><span>${esc(fv(ind,lo))}</span><span>${esc(fv(ind,hi))}</span></div>`:'<div style="height:30px"></div>'}
<div class="foot"><span>${rev}</span><span>Atualizado em <b>${fmtDayShort(s.last)}</b></span></div></a>`;
}
function revisions(){
  const rows=[];
  FC.forecasts.forEach(f=>{
    if(f.prior_value==null||Number(f.prior_value)===Number(f.value)||isStale(f))return;
    const ind=FC.indicators.find(i=>i.key===f.indicator);if(!ind)return;
    rows.push({f,ind,rel:Math.abs(Number(f.value)-Number(f.prior_value))/Math.max(Math.abs(Number(f.prior_value)),1e-9)});
  });
  rows.sort((a,b)=>b.f.as_of.localeCompare(a.f.as_of)||b.rel-a.rel);
  return rows.slice(0,8);
}
const revCard=({f,ind})=>{const up=Number(f.value)>Number(f.prior_value);return `<a class="card rev" href="/previsoes/${esc(ind.key)}"><span class="arrow" aria-hidden="true">${up?"▲":"▼"}</span><div><div class="t"><b>${esc(f.house)}</b> ${up?"elevou":"reduziu"} ${esc(ind.name.replace(/^(.)/,c=>c.toLowerCase()))}</div><div class="t"><span class="v">${esc(fv(ind,f.prior_value))} → ${esc(fv(ind,f.value))}</span> <span class="d">(${esc(fdelta(ind,Number(f.value)-Number(f.prior_value)))}) · ${fmtDayShort(f.as_of)}</span></div></div></a>`};

/* ---------- home: previsões ---------- */
async function home(){
  renderNav("prev");
  const secao=new URLSearchParams(location.search).get("secao");
  setMeta(secao?`Previsões de ${secao} | Lottus News`:"Lottus News | Previsões do mercado","As projeções dos maiores players do mercado em um só lugar: bancos, casas de análise e Boletim Focus, com data e fonte de cada número.",secao?"/?secao="+encodeURIComponent(secao):"/");
  $.innerHTML=`<section class="card intro"><div><div class="kick">Previsões do mercado</div><h1>O que os maiores players <em>esperam</em></h1><p>Reunimos as projeções de bancos, casas de análise e do Boletim Focus em um só lugar, com a data e a fonte de cada número.</p></div><div class="facts" id="facts"><div><b>–</b><span>Indicadores</span></div><div><b>–</b><span>Projeções</span></div><div><b>–</b><span>Casas</span></div></div></section><div id="body">${skeletonGrid(6)}</div>`;
  try{
    await loadFC();
    const cats=catsWithInd();
    const list=secao&&cats.includes(secao)?FC.indicators.filter(i=>i.category===secao):FC.indicators;
    const houses=new Set(FC.forecasts.map(f=>f.house));
    document.getElementById("facts").innerHTML=`<div><b>${FC.indicators.length}</b><span>Indicadores</span></div><div><b>${FC.forecasts.length}</b><span>Projeções</span></div><div><b>${houses.size}</b><span>Casas</span></div>`;
    const chips=`<nav class="chips" aria-label="Filtrar por tema"><a class="chip" href="/"${!secao?' aria-current="true"':""}>Todos</a>${cats.map(c=>`<a class="chip" href="/?secao=${encodeURIComponent(c)}"${c===secao?' aria-current="true"':""}>${esc(c)}</a>`).join("")}</nav>`;
    const revs=revisions();
    document.getElementById("body").innerHTML=`${chips}<section class="grid" aria-label="Indicadores">${list.map(i=>indCard(i,calc(i))).join("")}</section>
<div class="legend2" aria-hidden="true"><span><i></i>Casa</span><span><i class="f"></i>Boletim Focus (consenso do BC)</span><span><i class="a"></i>Média das casas</span></div>
${revs.length?`<div class="sechd"><span>Revisões recentes</span></div><section class="revs">${revs.map(revCard).join("")}</section>`:""}
<div class="sechd"><span>Notícias e análises</span><a href="/noticias">Ver todas</a></div><section id="homenews"></section>`;
    rpc("news_latest",{p_limit:3,p_offset:0,p_category:null}).then(rows=>{const h=document.getElementById("homenews");if(!h)return;h.innerHTML=rows.length?`<div class="grid">${rows.map(gridCard).join("")}</div>`:`<div class="card msg"><p>Nenhuma matéria publicada ainda.</p></div>`}).catch(()=>{});
  }catch(e){document.getElementById("body").innerHTML=errBox();document.getElementById("retry").onclick=()=>{FC=null;home()}}
}

/* ---------- detalhe do indicador ---------- */
async function indicator(key){
  renderNav("prev");
  $.innerHTML=`<div class="crumbs"><a href="/">Previsões</a></div><div class="card dh"><div class="sk" style="height:16px;width:120px"></div><div class="sk" style="height:46px;margin:16px 0"></div><div class="sk" style="height:60px"></div></div>`;
  try{
    await loadFC();
    const ind=FC.indicators.find(i=>i.key===key);
    if(!ind){setMeta("Indicador não encontrado | Lottus News","","/");$.innerHTML=`<div class="card msg"><h2>Indicador não encontrado</h2><p>O link pode estar errado.</p><a class="btn" href="/">Ver todas as previsões</a></div>`;return}
    const s=calc(ind);const m=mainLabel(ind,s);
    const url=ORIGIN+"/previsoes/"+ind.key;
    setMeta(`${ind.name}: o que os grandes players projetam | Lottus News`,`Projeções de bancos, casas de análise e Boletim Focus para ${ind.name.toLowerCase()}, com data e fonte.`,"/previsoes/"+ind.key);
    const rowsAll=[...s.all].sort((a,b)=>b.value-a.value);
    const vals=s.all.filter(f=>f.kind!=="mercado de previsão").map(f=>f.value).concat(s.mean!=null?[s.mean]:[]);
    const lo=Math.min(...vals),hi=Math.max(...vals);
    const cls=f=>f.kind==="consenso"?"focus":f.kind==="mercado de previsão"?"mkt":isStale(f)?"old":"";
    const cmpRows=rowsAll.map(f=>`<div class="crow"><div class="n">${esc(f.house)}<small>${esc(f.as_of_label||fmtDay(f.as_of))}${isStale(f)?" · antiga":""}</small></div><div class="tr"><i class="${cls(f)}" style="left:${pos(f.value,lo,hi)}%"></i></div><div class="v">${esc(fv(ind,f.value))}</div></div>`).join("");
    const avgRow=s.houses.length>=2?`<div class="crow avg"><div class="n">Média das casas<small>${s.houses.length} casas com dado recente</small></div><div class="tr"><i class="avgm" style="left:${pos(s.mean,lo,hi)}%"></i></div><div class="v">${esc(fv(ind,s.mean))}</div></div>`:"";
    const tag=f=>f.kind==="consenso"?'<span class="tag cons">Consenso</span>':f.kind==="mercado de previsão"?'<span class="tag mkt">Mercado</span>':isStale(f)?'<span class="tag old">Antiga</span>':"";
    const tr=rowsAll.map(f=>{
      const has=f.prior_value!=null&&f.prior_value!==f.value;
      const dl=has?`${f.value>f.prior_value?"▲":"▼"} ${esc(fdelta(ind,f.value-f.prior_value))}`:(f.prior_value!=null?"Sem mudança":"—");
      return `<tr class="${isStale(f)?"old":""}"><td><b>${esc(f.house)}</b>${tag(f)}<small>${esc(f.kind)}</small></td><td><b>${esc(fv(ind,f.value))}</b></td><td>${f.prior_value!=null?esc(fv(ind,f.prior_value)):"—"}</td><td>${dl}</td><td>${esc(f.as_of_label||fmtDay(f.as_of))}</td><td><a href="${esc(safeUrl(f.source_url))}" target="_blank" rel="noopener noreferrer">${esc(f.source_title)}</a>${f.note?`<small>${esc(f.note)}</small>`:""}</td></tr>`;
    }).join("");
    $.innerHTML=`<nav class="crumbs" aria-label="Você está em"><a href="/">Previsões</a><span>/</span><a href="/?secao=${encodeURIComponent(ind.category)}">${esc(ind.category)}</a></nav>
<article><header class="card dh"><div class="kick">${esc(ind.category)} · ${esc(ind.horizon)}</div><h1>${esc(ind.name)}</h1><p class="dek">${esc((ind.description||"").replace(/\.?$/,"."))} Unidade: ${esc(ind.unit_label)}</p>
<div class="stats"><div class="stat"><div class="l">${m.l.startsWith("Média")?"Média das casas":"Referência"}</div><div class="v">${m.v}</div><div class="d">${m.l}</div></div>
<div class="stat"><div class="l">Intervalo</div><div class="v">${s.min!=null?esc(fv(ind,s.min)):"—"}${s.min!=null&&s.max!==s.min?" – "+esc(fv(ind,s.max)):""}</div><div class="d">menor e maior projeção recente</div></div>
${s.focus?`<div class="stat"><div class="l">Boletim Focus</div><div class="v">${esc(fv(ind,s.focus.value))}</div><div class="d">consenso do Banco Central, ${fmtDay(s.focus.as_of)}</div></div>`:""}
<div class="stat"><div class="l">Revisões</div><div class="v">${s.up||s.down?`▲${s.up} ▼${s.down}`:"—"}</div><div class="d">casas que elevaram ou reduziram</div></div></div>
<div class="tools" role="group" aria-label="Compartilhar"><a class="tool" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(ind.name+" "+url)}">${SH.wa}<span class="t">WhatsApp</span></a><a class="tool" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">${SH.li}<span class="t">LinkedIn</span></a><button class="tool" id="copy">${SH.cp}<span class="t">Copiar link</span></button><button class="tool" id="print">${SH.pr}<span class="t">Imprimir</span></button></div></header>
<section class="card sect"><h2><small>Comparativo</small>Onde cada casa está</h2><div class="cmp">${avgRow}${cmpRows}</div><p class="note">Losango rosa: consenso do Focus. Círculo vazio: projeção antiga (mais de ${STALE_DAYS} dias), que não entra na média. Tracejado: mercado de previsão, que não é projeção de banco e também não entra na média.</p></section>
<section class="card sect"><h2><small>Detalhe</small>Projeção, revisão e fonte</h2><div class="tw"><table class="tbl"><thead><tr><th>Casa</th><th>Projeção</th><th>Anterior</th><th>Revisão</th><th>Data</th><th>Fonte</th></tr></thead><tbody>${tr}</tbody></table></div><p class="note">Cada número vem da página citada, aberta por nós. Quando a fonte é uma matéria que reproduz o relatório, não abrimos o relatório original. O que não conseguimos confirmar está indicado na própria linha.</p></section>
<section class="card sect" id="histsec" hidden><h2><small>Histórico</small>Como as projeções mudaram</h2><ul class="hist" id="hist"></ul></section>
<section class="related" id="related" hidden><div class="sechd"><span>Outros indicadores de ${esc(ind.category)}</span></div><div class="grid" id="relgrid"></div></section>
<section class="related" id="relnews" hidden><div class="sechd"><span>Notícias relacionadas</span><a href="/noticias">Ver todas</a></div><div class="grid" id="relnewsgrid"></div></section></article>`;
    window.scrollTo(0,0);
    document.getElementById("print").onclick=()=>window.print();
    document.getElementById("copy").onclick=()=>copyLink(url);
    const others=FC.indicators.filter(i=>i.category===ind.category&&i.key!==ind.key).slice(0,3);
    if(others.length){document.getElementById("related").hidden=false;document.getElementById("relgrid").innerHTML=others.map(i=>indCard(i,calc(i))).join("")}
    rpc("news_forecast_history",{p_indicator:ind.key}).then(h=>{
      const by={};h.forEach(x=>{(by[x.house]=by[x.house]||[]).push(x)});
      const items=Object.entries(by).filter(([,a])=>a.length>1);
      if(items.length){document.getElementById("histsec").hidden=false;document.getElementById("hist").innerHTML=items.map(([k,a])=>`<li><b>${esc(k)}</b>: ${a.map(x=>esc(fv(ind,x.value))+" ("+fmtDayShort(x.as_of)+")").join(" → ")}</li>`).join("")}
    }).catch(()=>{});
    rpc("news_latest",{p_limit:3,p_offset:0,p_category:ind.category}).then(r=>{if(r.length){document.getElementById("relnews").hidden=false;document.getElementById("relnewsgrid").innerHTML=r.map(gridCard).join("")}}).catch(()=>{});
  }catch(e){$.innerHTML=`<div class="crumbs"><a href="/">Previsões</a></div>${errBox()}`;document.getElementById("retry").onclick=()=>{FC=null;indicator(key)}}
}
async function copyLink(url){try{await navigator.clipboard.writeText(url);toast("Link copiado")}catch(_){const i=document.createElement("input");i.value=url;document.body.appendChild(i);i.select();try{document.execCommand("copy");toast("Link copiado")}catch(__){toast(url)}i.remove()}}

/* ---------- notícias ---------- */
let state={cat:null,items:[],off:0,done:false,loading:false};
const PAGE=13;
const itemCard=a=>`<a class="card item" href="/materia/${esc(a.slug)}"><div class="kick">${esc(a.category)} <span class="when">· ${fmt(a.published_at)}</span></div><h3>${esc(a.headline)}</h3><p>${esc(a.dek)}</p></a>`;
const gridCard=a=>`<a class="card item" href="/materia/${esc(a.slug)}"><div class="kick">${esc(a.category)} <span class="when">· ${fmt(a.published_at)}</span></div><h3>${esc(a.headline)}</h3><p>${esc(a.dek)}</p><div style="margin-top:10px">${tickers(a.tickers)}</div></a>`;
async function news(){
  renderNav("not");
  const cat=NCATS.includes(new URLSearchParams(location.search).get("secao"))?new URLSearchParams(location.search).get("secao"):null;
  state={cat,items:[],off:0,done:false,loading:false};
  setMeta(cat?`${cat}: notícias | Lottus News`:"Notícias | Lottus News","Notícias que podem mexer nos preços e nas projeções, com fatos, fontes e os limites do que sabemos.",cat?"/noticias?secao="+encodeURIComponent(cat):"/noticias");
  const chips=`<nav class="chips" aria-label="Filtrar por tema"><a class="chip" href="/noticias"${!cat?' aria-current="true"':""}>Todas</a>${NCATS.map(c=>`<a class="chip" href="/noticias?secao=${encodeURIComponent(c)}"${c===cat?' aria-current="true"':""}>${c}</a>`).join("")}</nav>`;
  $.innerHTML=`${chips}<div id="list"><div class="front"><div class="card lead"><div class="sk" style="height:16px;width:90px"></div><div class="sk" style="height:46px;margin:16px 0"></div></div><div></div></div></div>`;
  await more();
}
async function more(){
  const list=document.getElementById("list");if(!list||state.loading)return;state.loading=true;
  try{
    const rows=await rpc("news_latest",{p_limit:PAGE,p_offset:state.off,p_category:state.cat});
    state.items=state.items.concat(rows);state.off+=rows.length;state.done=rows.length<PAGE;
    if(!state.items.length){list.innerHTML=`<div class="card msg"><h2>Nenhuma matéria ${state.cat?"em "+esc(state.cat):"por enquanto"}</h2><p>Publicamos quando uma notícia passa no critério de materialidade.</p>${state.cat?'<a class="btn ghost" href="/noticias">Ver todas as seções</a>':""}</div>`;return}
    const [h,...rest]=state.items;
    const side=rest.slice(0,4),grid=rest.slice(4);
    const kp=(h.key_numbers||[]).slice(0,3).map(x=>`<div class="kpi"><div class="l">${esc(x.label)}</div><div class="v">${esc(x.value)}</div><div class="d ${toneCls(x.tone)}">${esc(x.delta)}</div></div>`).join("");
    list.innerHTML=`<section class="front" aria-label="Destaques">
<a class="card lead" href="/materia/${esc(h.slug)}"><div class="kick">${esc(h.category)}${h.severity==="alta"?" · Em destaque":""} <span class="when">· ${fmt(h.published_at,true)} (${ago(h.published_at)})</span></div><h2>${esc(h.headline)}</h2><p class="dek">${esc(h.dek)}</p>${kp?`<div class="kpis">${kp}</div>`:""}<div>${tickers(h.tickers)}</div></a>
<div class="side"><h2 class="sidehd">Mais recentes</h2>${side.length?side.map(itemCard).join(""):'<div class="card item"><p>Sem outras matérias por enquanto.</p></div>'}</div></section>
${grid.length?`<div class="sechd"><span>Mais notícias</span></div><section class="grid">${grid.map(gridCard).join("")}</section>`:""}
${state.done?"":'<div class="center"><button class="btn ghost" id="more">Ver mais matérias</button></div>'}`;
    const m=document.getElementById("more");if(m)m.onclick=()=>more();
  }catch(e){list.innerHTML=errBox();document.getElementById("retry").onclick=()=>news()}
  finally{state.loading=false}
}

/* ---------- matéria ---------- */
const SH={
 wa:'<svg viewBox="0 0 24 24"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.3L2 22l4.8-1.2A11 11 0 1 0 20.5 3.5zm-8.4 17a9 9 0 0 1-4.6-1.3l-.3-.2-2.8.7.8-2.7-.2-.3a9 9 0 1 1 7.1 3.8zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.5-.1-.7.1-.8.9-.9 1.1-.3.2-.6.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.5a.6.6 0 0 0 0-.5l-.9-2.1c-.2-.5-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.7 3.7 0 0 0-1.1 2.7c0 1.6 1.2 3.2 1.3 3.4s2.3 3.5 5.6 4.9c2 .8 2.8.9 3.8.7a3.2 3.2 0 0 0 2.1-1.5 2.6 2.6 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3z"/></svg>',
 x:'<svg viewBox="0 0 24 24"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
 li:'<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3V9.5zm6.5 0h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5z"/></svg>',
 cp:'<svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
 pr:'<svg viewBox="0 0 24 24"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8v5zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM18 3H6v4h12V3z"/></svg>'
};
function secHTML(id,over,title,inner){return inner?`<section class="card sect" id="${id}"><h2><small>${over}</small>${title}</h2>${inner}</section>`:""}
async function article(slug){
  renderNav("not");
  $.innerHTML=`<div class="crumbs"><a href="/noticias">Notícias</a></div><div class="art"><div><div class="card hero"><div class="sk" style="height:14px;width:100px"></div><div class="sk" style="height:48px;margin:16px 0"></div><div class="sk" style="height:48px;width:75%"></div></div></div><div></div></div>`;
  try{
    const r=await rpc("news_by_slug",{p_slug:slug});const a=r[0];
    if(!a){setMeta("Matéria não encontrada | Lottus News","A matéria não existe ou foi removida.","/");
      $.innerHTML=`<div class="card msg"><h2>Matéria não encontrada</h2><p>O link pode estar errado ou a matéria foi retirada do ar.</p><a class="btn" href="/noticias">Ir para as notícias</a></div>`;return}
    const url=ORIGIN+"/materia/"+a.slug;
    setMeta(a.headline+" | Lottus News",a.dek,"/materia/"+a.slug);
    const kp=(a.key_numbers||[]);
    const wh=(a.what_happened||[]).map(x=>`<div class="fact">${lab(x.label)}<div>${esc(x.text)}</div></div>`).join("");
    const cx=(a.context||[]).map(x=>`<div class="blk"><h3>${esc(x.title)}${lab(x.label)}</h3><p>${esc(x.text)}</p></div>`).join("");
    const im=a.impact&&a.impact.length?`<div class="tw"><table class="tbl" style="min-width:560px"><thead><tr><th>Ativo ou setor</th><th>Efeito</th><th>Por quê</th><th>Base</th></tr></thead><tbody>${a.impact.map(x=>`<tr><td><b>${esc(x.asset)}</b></td><td class="eff ${esc(x.effect)}">${esc(x.effect)}</td><td>${esc(x.why)}</td><td>${lab(x.basis)}</td></tr>`).join("")}</tbody></table></div>`:"";
    const sc=a.scenarios&&a.scenarios.length?`<div class="sc">${a.scenarios.map(x=>`<div><h3>${esc(x.title)}</h3><div>${esc(x.text)}</div><div class="sg"><b>Sinais:</b> ${esc(x.signals)}</div></div>`).join("")}</div>`:"";
    const cs=a.confirm_signals&&a.confirm_signals.length?`<ul class="ifs">${a.confirm_signals.map(x=>`<li><b>Se</b> ${esc(x.if)}, ${esc(x.then)}.</li>`).join("")}</ul>`:"";
    const tl=a.timeline&&a.timeline.length>1?`<ul class="tl">${a.timeline.map(x=>`<li><time datetime="${esc(x.at)}">${fmt(x.at,true)}</time>${esc(x.text)}</li>`).join("")}</ul>`:"";
    const sr=a.sources&&a.sources.length?`<ol class="src">${a.sources.map((x,i)=>`<li><span class="n">${i+1}</span><div><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a><span>${esc(x.outlet)}${x.date?" · "+esc(x.date.split("-").reverse().join("/")):""}</span></div></li>`).join("")}</ol>`:"";
    const lm=a.limits&&a.limits.length?`<ul class="lim">${a.limits.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:"";
    const sections=[["fatos","O que aconteceu",wh],["contexto","Por que importa",cx],["efeitos","Quem é afetado",im],["cenarios","Cenários",sc],["confirmar","O que confirmar",cs],["linha","Linha do tempo",tl],["fontes","Fontes",sr],["limites","Limites",lm]].filter(s=>s[2]);
    const upd=a.updated_at&&new Date(a.updated_at)-new Date(a.published_at)>6e4*5;
    const share=`<div class="tools" role="group" aria-label="Compartilhar">
<a class="tool" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(a.headline+" "+url)}">${SH.wa}<span class="t">WhatsApp</span></a>
<a class="tool" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(a.headline)}&url=${encodeURIComponent(url)}">${SH.x}<span class="t">X</span></a>
<a class="tool" target="_blank" rel="noopener" href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}">${SH.li}<span class="t">LinkedIn</span></a>
<button class="tool" id="copy">${SH.cp}<span class="t">Copiar link</span></button>
<button class="tool" id="print">${SH.pr}<span class="t">Imprimir</span></button></div>`;
    const rail=`<aside class="rail" aria-label="Resumo e leitura relacionada">${kp.length?`<div class="card"><h5>Em números</h5>${kp.map(x=>`<div class="kv"><div class="l">${esc(x.label)}</div><div class="v">${esc(x.value)}</div><div class="d ${toneCls(x.tone)}">${esc(x.delta)}</div></div>`).join("")}</div>`:""}<div class="card" id="relbox" hidden><h5>Leia também</h5><div id="rellist"></div></div></aside>`;
    $.innerHTML=`<nav class="crumbs" aria-label="Você está em"><a href="/noticias">Notícias</a><span>/</span><a href="/noticias?secao=${encodeURIComponent(a.category)}">${esc(a.category)}</a></nav>
<div class="art"><article>
<header class="card hero"><div class="kick">${esc(a.category)}${a.severity==="alta"?" · Em destaque":""}</div><h1>${esc(a.headline)}</h1><p class="dek">${esc(a.dek)}</p>
<div class="meta"><span><b>Redação Lottus</b></span><time datetime="${esc(a.published_at)}">Publicado em ${fmt(a.published_at,true)}</time>${upd?`<time datetime="${esc(a.updated_at)}">Atualizado em ${fmt(a.updated_at,true)}</time>`:""}<span>${tickers(a.tickers)}</span></div>
${share}
${a.pdf_url?`<div class="tools"><a class="btn" href="${esc(safeUrl(a.pdf_url))}" target="_blank" rel="noopener">Baixar PDF Lottus</a></div>`:""}
<nav class="toc" aria-label="Nesta matéria">${sections.map(s=>`<a href="#${s[0]}">${s[1]}</a>`).join("")}</nav></header>
${secHTML("fatos","Fatos","O que aconteceu",wh)}${secHTML("contexto","Contexto","Por que importa",cx)}${secHTML("efeitos","Mapa de efeitos","Quem se beneficia e quem é afetado",im)}${secHTML("cenarios","Cenários","O que pode acontecer",sc)}${secHTML("confirmar","Leitura nossa","O que confirmar",cs)}${secHTML("linha","Atualizações","Linha do tempo",tl)}${secHTML("fontes","Fontes","Onde está a informação",sr)}${secHTML("limites","Limites","O que não conseguimos confirmar",lm)}
<div class="card sect"><div class="legend"><span><span class="lab Reportado">Reportado</span> vem das fontes</span><span><span class="lab Leitura">Leitura nossa</span> interpretação da Lottus</span><span><span class="lab Hipótese">Hipótese</span> ainda não confirmada</span></div></div>
<p class="disc">${esc(a.disclaimer)}</p>
</article>${rail}</div>
<section class="related" id="related" hidden><div class="sechd"><span>Leia também</span></div><div class="grid" id="relgrid"></div></section>`;
    window.scrollTo(0,0);
    document.getElementById("print").onclick=()=>window.print();
    document.getElementById("copy").onclick=()=>copyLink(url);
    spy();
    related(a);
  }catch(e){
    $.innerHTML=`<div class="crumbs"><a href="/noticias">Notícias</a></div>${errBox()}`;document.getElementById("retry").onclick=()=>article(slug);
  }
}
async function related(a){
  try{
    let rows=await rpc("news_latest",{p_limit:8,p_offset:0,p_category:a.category});
    rows=rows.filter(x=>x.slug!==a.slug);
    if(rows.length<3){const more=await rpc("news_latest",{p_limit:10,p_offset:0,p_category:null});rows=rows.concat(more.filter(x=>x.slug!==a.slug&&!rows.some(r=>r.slug===x.slug)))}
    rows=rows.slice(0,6);if(!rows.length)return;
    const box=document.getElementById("relbox");
    if(box){box.hidden=false;document.getElementById("rellist").innerHTML=rows.slice(0,3).map(x=>`<a class="mini" href="/materia/${esc(x.slug)}"><div class="kick">${esc(x.category)} <span class="when">· ${ago(x.published_at)}</span></div><h4>${esc(x.headline)}</h4></a>`).join("")}
    if(rows.length>3){const s=document.getElementById("related");s.hidden=false;document.getElementById("relgrid").innerHTML=rows.slice(3).map(gridCard).join("")}
  }catch(_){}
}
let spyObs;
function spy(){
  if(spyObs)spyObs.disconnect();
  const links=[...document.querySelectorAll(".toc a")];if(!links.length||!("IntersectionObserver" in window))return;
  spyObs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){links.forEach(l=>l.classList.toggle("on",l.getAttribute("href")==="#"+e.target.id))}})},{rootMargin:"-30% 0px -60% 0px"});
  links.forEach(l=>{const t=document.querySelector(l.getAttribute("href"));if(t)spyObs.observe(t)});
}
const bar=document.getElementById("progress"),top_=document.getElementById("totop");
function onScroll(){
  const art=document.querySelector("article");
  if(art){const r=art.getBoundingClientRect();const total=r.height-innerHeight*0.6;const p=Math.min(1,Math.max(0,(-r.top+innerHeight*0.2)/Math.max(total,1)));bar.style.width=(p*100)+"%"}else bar.style.width="0";
  top_.classList.toggle("show",scrollY>700);
}
addEventListener("scroll",onScroll,{passive:true});
top_.onclick=()=>scrollTo({top:0,behavior:"smooth"});
document.getElementById("ftop").onclick=e=>{e.preventDefault();scrollTo({top:0,behavior:"smooth"})};
/* rodapé: temas */
(async()=>{try{await loadFC();document.getElementById("fsec").innerHTML=catsWithInd().map(c=>`<li><a href="/?secao=${encodeURIComponent(c)}">${esc(c)}</a></li>`).join("")}catch(_){document.getElementById("fsec").innerHTML=["Brasil","Exterior","Commodities","Cripto"].map(c=>`<li><a href="/?secao=${c}">${c}</a></li>`).join("")}})();
/* roteamento */
function route(){
  const p=location.pathname;let m;
  bar.style.width="0";
  if(m=p.match(/^\/materia\/([a-z0-9-]+)\/?$/))article(m[1]);
  else if(m=p.match(/^\/previsoes\/([a-z0-9_]+)\/?$/))indicator(m[1]);
  else if(/^\/noticias\/?$/.test(p))news();
  else home();
}
document.addEventListener("click",e=>{
  const a=e.target.closest("a[href]");if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||a.target||a.hasAttribute("download"))return;
  const h=a.getAttribute("href");
  if(h.startsWith("#"))return;
  if(h.startsWith("/")){e.preventDefault();history.pushState({},"",h);lastKey=location.pathname+location.search;route();window.scrollTo(0,0)}
});
let lastKey=location.pathname+location.search;
addEventListener("popstate",()=>{const k=location.pathname+location.search;if(k===lastKey)return;lastKey=k;route()});
route();

// lib/dataLoader.js
async function j(path){ const r = await fetch(path, { cache:"no-store" }); if(!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); }

export async function loadAllData(){
  const [hris,lms,cms,gong,crm,support] = await Promise.all([
    j("./data/hris.json"), j("./data/lms_lrs.json"), j("./data/cms.json"),
    j("./data/gong.json"), j("./data/crm.json"), j("./data/support.json")
  ]);
  return { hris,lms,cms,gong,crm,support };
}

export function indexBy(arr, key){
  const m = new Map();
  for(const row of arr) m.set(row[key], row);
  return m;
}

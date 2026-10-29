function d(e){const t=String(e||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean),n=[];let o="";for(const r of t){const c=o?o+" "+r:r;c.length>42&&o?(n.push(o),o=r):o=c}return o&&n.push(o),n}function p(e){const t=[];let n=0;for(const o of e||[]){const r=Math.max(1,Number(o.seconds)||1),c=d(o.voiceover||o.caption),l=[];for(let s=0;s<c.length;s+=2)l.push(c.slice(s,s+2));const $=l.reduce((s,f)=>s+f.join(" ").length,0)||1;let a=n;l.forEach((s,f)=>{const h=f===l.length-1?n+r-a:r*(s.join(" ").length/$);t.push({start:a,end:a+h,text:s.join(`
`)}),a+=h}),n+=r}return t}const i=(e,t=2)=>String(e).padStart(t,"0");function u(e,t){const n=Math.round(e*1e3),o=Math.floor(n/36e5),r=Math.floor(n%36e5/6e4),c=Math.floor(n%6e4/1e3),l=n%1e3;return`${i(o)}:${i(r)}:${i(c)}${t?",":"."}${i(l,3)}`}function M(e){return p(e).map((t,n)=>`${n+1}
${u(t.start,!0)} --> ${u(t.end,!0)}
${t.text}
`).join(`
`)}function g(e){return`WEBVTT

`+p(e).map(t=>`${u(t.start,!1)} --> ${u(t.end,!1)}
${t.text}
`).join(`
`)}export{p as cues,M as toSrt,g as toVtt};

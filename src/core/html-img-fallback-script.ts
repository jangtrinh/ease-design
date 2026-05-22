/**
 * Inline IIFE fallback script injected by the img-onerror autofix rule.
 *
 * Cascade on broken image load:
 *   step 0 — picsum.photos with a seeded URL (context-aware)
 *   step 1+ — SVG data-URI placeholder (always works, fully offline)
 *
 * The Unsplash /api/unsplash/search fetch step present in the EaseUI origin
 * has been intentionally removed: that endpoint does not exist in ease-design
 * and would silently fail at runtime. The cascade is now picsum → SVG only,
 * keeping the injected script deterministic and dependency-free.
 */

export function getImageFallbackScriptInline(): string {
  return `<script>
(function(){function ctx(i){if(i.alt&&i.alt!=='image'&&i.alt.length>2)return i.alt;var e=i.parentElement;for(var x=0;x<5&&e;x++){var h=e.querySelector('h1,h2,h3,h4');if(h&&h.textContent)return h.textContent.trim().substring(0,40);e=e.parentElement}var s=i.getAttribute('data-original-src')||i.src||'';var m=s.match(/seed\\/([^\\/]+)/);if(m)return m[1].replace(/[-_]/g,' ');return 'abstract'}function svg(w,h){return"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='"+(w||400)+"' height='"+(h||300)+"'%3E%3Crect width='100%25' height='100%25' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EImage%3C/text%3E%3C/svg%3E"}window.__imgFallback=function(i){var a=parseInt(i.getAttribute('data-fb')||'0');if(a>=2){i.src=svg(i.width,i.height);return}i.setAttribute('data-fb',a+1);if(!i.getAttribute('data-original-src'))i.setAttribute('data-original-src',i.src);if(a===0){var seed=ctx(i).replace(/[^a-zA-Z0-9]/g,'').substring(0,20)||'fallback';var w=i.width||i.naturalWidth||800;var h=i.height||i.naturalHeight||600;i.src='https://picsum.photos/seed/'+seed+'/'+Math.min(w,1200)+'/'+Math.min(h,800);return}i.src=svg(i.width,i.height)}})();
</script>`;
}

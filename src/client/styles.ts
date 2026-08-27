export const STYLE_ID = 'dsh-skill-manager/styles'

export const STYLE_TEXT = `
.dsm-root{display:grid;gap:28px;padding:8px 4px 28px;color:var(--dsw-color-text-primary,#171717)}
.dsm-header{display:grid;gap:8px}.dsm-header h2,.dsm-panel h2{margin:0}.dsm-subtitle{margin:0;color:var(--dsw-color-text-secondary,#666)}
.dsm-panel{display:grid;gap:16px}.dsm-search{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.dsm-field{display:grid;gap:7px;flex:1 1 320px;font-weight:600}.dsm-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--dsw-color-border,#d8d8d8);border-radius:10px;background:var(--dsw-color-bg-primary,#fff);color:inherit;font:inherit}
.dsm-button{min-height:36px;padding:7px 13px;border:1px solid transparent;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}.dsm-button:disabled{cursor:not-allowed;opacity:.5}.dsm-button-primary{background:var(--dsw-alias-button-primary-fill,#3b55d9);color:var(--dsw-alias-label-primary-inverted,#fff)}.dsm-button-secondary{border-color:var(--dsw-color-border,#d8d8d8);background:var(--dsw-color-bg-secondary,#f6f6f6);color:inherit}.dsm-button-danger{background:#c73e3e;color:#fff}
.dsm-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:0;padding:0;list-style:none}.dsm-card{display:grid;align-content:start;gap:10px;min-width:0;height:100%;box-sizing:border-box;padding:16px;border:1px solid var(--dsw-color-border,#dedede);border-radius:14px;background:var(--dsw-color-bg-secondary,#fafafa)}.dsm-card h3{margin:0;overflow-wrap:anywhere}.dsm-card p{margin:0;line-height:1.5}.dsm-description{color:var(--dsw-color-text-secondary,#5f5f5f)}.dsm-meta{font-size:13px;color:var(--dsw-color-text-secondary,#707070)}.dsm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:4px}.dsm-link{align-content:center;color:var(--dsw-alias-label-primary,#1f1f1f);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.dsm-status{margin:0;padding:11px 13px;border-radius:10px;background:var(--dsw-color-bg-secondary,#f3f5ff)}.dsm-error{border:1px solid #d97a7a;background:#fff1f1;color:#8e2424}.dsm-empty{padding:24px;border:1px dashed var(--dsw-color-border,#ccc);border-radius:12px;text-align:center;color:var(--dsw-color-text-secondary,#666)}
.dsm-badge{justify-self:start;padding:3px 8px;border-radius:999px;background:#e8edff;color:#334bbd;font-size:12px;font-weight:700}.dsm-badge[data-state="locally-modified"],.dsm-badge[data-state="invalid"],.dsm-badge[data-state="missing"]{background:#fff0cd;color:#805800}
.dsm-dialog-backdrop{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;padding:20px;background:rgb(0 0 0/.45)}.dsm-dialog{display:grid;gap:16px;width:min(460px,100%);max-height:min(680px,calc(100vh - 40px));overflow:auto;box-sizing:border-box;padding:22px;border-radius:16px;background:var(--dsw-color-bg-primary,#fff);box-shadow:0 20px 60px rgb(0 0 0/.28)}.dsm-dialog h3{margin:0}.dsm-dialog-body{display:grid;gap:10px}.dsm-dialog-body p{margin:0;line-height:1.5}.dsm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
@media (max-width:640px){.dsm-list{grid-template-columns:1fr}.dsm-search>.dsm-button{width:100%}}
`

export function installStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>(
    `style[data-plugin-css="${STYLE_ID}"]`,
  )
  if (existing !== null) return () => undefined

  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-skill-manager'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
  return () => style.remove()
}

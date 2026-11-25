// Public semantic attributes and CSS variables, never generated class hashes.
export const SHELL_CAPABILITIES={
 frame:['data-app-shell-frame'],main:['data-app-shell-main-surface'],
 sidebar:['data-sidebar-navigation-root','data-slate-sidebar-content'],
 composer:['data-composer-surface-variant','--composer-layout-surface-background']
};
export function checkCapabilities(sources){
 const missing=Object.entries(SHELL_CAPABILITIES).filter(([,alternatives])=>!alternatives.some(value=>sources.includes(value))).map(([name])=>name);
 if(missing.length)throw Error('Unsupported shell capabilities: '+missing.join(', '));
 return Object.keys(SHELL_CAPABILITIES);
}

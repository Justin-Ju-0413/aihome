/**
 * 阻塞式主题预设:在任何内容渲染前把 html[data-theme] 写好,避免暗色用户首帧闪白。
 * localStorage('aihome.theme') 存 'light' | 'dark' 表示用户显式选择;
 * 无值(或读写失败)时跟随系统 prefers-color-scheme。
 */
export function ThemeScript() {
  const script = `(function(){try{var t=localStorage.getItem('aihome.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}})()`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

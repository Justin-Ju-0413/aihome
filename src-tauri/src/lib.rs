mod server;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

fn toggle_window(app: &AppHandle, label: &str) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window(label) {
        if w.is_visible()? {
            w.hide()?;
        } else {
            w.show()?;
            w.set_focus()?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 必须在任何线程创建前阻塞终止信号（SIGTERM/SIGINT），sigwait 线程随后接管
    server::block_termination_signals();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let exe_dir = app.path().resource_dir().expect("resource dir");
            let data_dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&data_dir)
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("create data dir: {e}")))?;
            server::start_next_server(&exe_dir, &data_dir)?;
            server::wait_healthy(Duration::from_secs(30))
                .map_err(|e| {
                    // 启动失败路径：先清理已 spawn 的 next-server，否则残留进程
                    // 继续占住 3010，下一次启动会直接 "Port already in use"
                    server::stop_next_server();
                    Box::<dyn std::error::Error>::from(e)
                })?;

            let show_main = MenuItem::with_id(app, "show_main", "显示主窗口", true, None::<&str>)?;
            let toggle_widget = MenuItem::with_id(app, "toggle_widget", "悬浮窗", true, None::<&str>)?;
            let auto_start = MenuItem::with_id(app, "autostart", "开机自启", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_main, &toggle_widget, &auto_start, &sep, &quit])?;

            let enabled = app.autolaunch().is_enabled().unwrap_or(false);
            auto_start.set_text(if enabled { "开机自启 ✓" } else { "开机自启" })?;

            // MenuEvent 只有 id 字段，菜单项文本更新需持有 MenuItem 克隆
            let auto_start_item = auto_start.clone();

            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    let _ = match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                            Ok(())
                        }
                        "show_main" => toggle_window(app, "main"),
                        "toggle_widget" => toggle_window(app, "widget"),
                        "autostart" => {
                            let enabled = app.autolaunch().is_enabled().unwrap_or(false);
                            let r = if enabled {
                                app.autolaunch().disable()
                            } else {
                                app.autolaunch().enable()
                            };
                            if r.is_ok() {
                                let _ = auto_start_item.set_text(if !enabled { "开机自启 ✓" } else { "开机自启" });
                            }
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                })
                .build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    server::install_signal_waiter(app.handle().clone());

    // 注意：macOS 上 tao 的 EventLoop::run 以 process::exit 结束（永不返回），
    // 所以 run() 之后的代码不会执行；退出前最后派发的是 RunEvent::Exit
    // （LoopDestroyed），清理必须挂在 Exit 上（AppleEvent 退出/关窗/托盘退出都覆盖）。
    app.run(|_app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            server::log("RunEvent::Exit(Requested): cleaning up next-server");
            server::stop_next_server();
        }
        _ => {}
    });
}

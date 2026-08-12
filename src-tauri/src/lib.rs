mod server;

use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

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
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit])?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    _ => {}
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

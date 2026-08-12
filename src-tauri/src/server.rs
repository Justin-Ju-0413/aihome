use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const PORT: u16 = 3010;
const HEALTH_URL: &str = "/api/health";

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

/// 调试用：GUI 应用 stderr 不可见，直接落盘
pub fn log(msg: &str) {
    use std::io::Write as _;
    let path = "/tmp/aihome-shell.log";
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{msg}");
    }
}

pub fn port_in_use() -> bool {
    TcpStream::connect(("127.0.0.1", PORT)).is_ok()
}

/// standalone 必须是可写目录：web 应用会把 `.aihome/`、`data/` 等运行时状态
/// 写到 `process.cwd()`（即 spawn 时的 current_dir）。
/// - dev（target/debug/standalone 软链）本身可写 → 直接用
/// - bundle（dmg 里的 Resources/standalone）只读 → 用 ditto 复制到 app_data_dir
fn writable_standalone(src: &Path, data_dir: &Path) -> Result<PathBuf, String> {
    if is_writable(src) {
        return Ok(src.to_path_buf());
    }
    let dst = data_dir.join("standalone");
    // 每次启动都重新复制：bundle 内 standalone 随 dmg 版本更新，若只在首次
    // 创建副本，用户升级后 node 仍会跑旧版代码。41MB 本地复制 <1s，可接受。
    // 副本内的 .aihome scan cache 会随重建清空（只影响首次扫描速度）；
    // 用户数据（~/.aihome/ 下的 usage/workbench/fv DB）不受影响。
    log("copying standalone to writable app data dir (ditto)");
    let _ = fs::remove_dir_all(&dst);
    let status = Command::new("ditto")
        .arg(src)
        .arg(&dst)
        .status()
        .map_err(|e| format!("failed to run ditto: {e}"))?;
    if !status.success() {
        return Err(format!("ditto failed with status {status}"));
    }
    Ok(dst)
}

fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(".aihome-write-probe");
    match fs::File::create(&probe) {
        Ok(f) => {
            drop(f);
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

pub fn start_next_server(exe_dir: &Path, data_dir: &Path) -> Result<(), String> {
    if port_in_use() {
        return Err(format!(
            "Port {} is already in use. AIHome needs it free.",
            PORT
        ));
    }
    let src = exe_dir.join("standalone");
    let server_js = src.join("server.js");
    if !server_js.exists() {
        return Err(format!("standalone server not found: {}", server_js.display()));
    }
    let standalone = writable_standalone(&src, data_dir)?;
    let child = Command::new("node")
        .arg(standalone.join("server.js"))
        .current_dir(&standalone)
        .spawn()
        .map_err(|e| format!("failed to spawn next server: {e}"))?;
    log(&format!("next-server spawned pid={}", child.id()));
    *CHILD.lock().unwrap() = Some(child);
    Ok(())
}

pub fn wait_healthy(timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if health_check().is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("next server did not become healthy in time".into())
}

fn health_check() -> Result<(), ()> {
    if let Ok(mut stream) = TcpStream::connect(("127.0.0.1", PORT)) {
        let req = format!(
            "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            HEALTH_URL, PORT
        );
        if stream.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if stream.read(&mut buf).map(|n| n > 0).unwrap_or(false) {
                return Ok(());
            }
        }
    }
    Err(())
}

pub fn stop_next_server() {
    if let Some(mut child) = CHILD.lock().unwrap().take() {
        log(&format!("stop_next_server: killing child pid={}", child.id()));
        let _ = child.kill();
        let _ = child.wait();
    } else {
        log("stop_next_server: no child registered");
    }
}

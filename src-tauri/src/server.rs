use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

const PORT: u16 = 3010;
const HEALTH_URL: &str = "/api/health";

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

pub fn port_in_use() -> bool {
    TcpStream::connect(("127.0.0.1", PORT)).is_ok()
}

pub fn start_next_server(exe_dir: &Path) -> Result<(), String> {
    if port_in_use() {
        return Err(format!(
            "Port {} is already in use. AIHome needs it free.",
            PORT
        ));
    }
    let standalone = exe_dir.join("standalone");
    let server_js = standalone.join("server.js");
    if !server_js.exists() {
        return Err(format!("standalone server not found: {}", server_js.display()));
    }
    let child = Command::new("node")
        .arg(&server_js)
        .current_dir(&standalone)
        .spawn()
        .map_err(|e| format!("failed to spawn next server: {e}"))?;
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
        let _ = child.kill();
        let _ = child.wait();
    }
}

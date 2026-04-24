use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TempTestDir {
    path: PathBuf,
}

impl TempTestDir {
    pub fn new(prefix: &str) -> Self {
        let mut path = std::env::temp_dir();
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before UNIX_EPOCH")
            .as_nanos();
        path.push(format!(
            "llm-chat-{}-{}-{}",
            prefix,
            std::process::id(),
            unique
        ));
        std::fs::create_dir_all(&path).expect("failed to create temp test dir");
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn join(&self, child: &str) -> PathBuf {
        self.path.join(child)
    }

    pub fn path_string(&self) -> String {
        self.path.to_string_lossy().into_owned()
    }
}

impl Drop for TempTestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

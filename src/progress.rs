use indicatif::{ProgressBar, ProgressStyle};
use std::time::{Duration, Instant};

/// Progress display manager
pub struct ProgressDisplay {
    bar: ProgressBar,
    start_time: Instant,
    estimated_attempts: u64,
}

impl ProgressDisplay {
    pub fn new(estimated_attempts: u64, prefix: &str) -> Self {
        let bar = ProgressBar::new(estimated_attempts);
        
        let style = ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] {msg}")
            .unwrap()
            .tick_chars("⠁⠂⠄⡀⢀⠠⠐⠈ ");
        
        bar.set_style(style);
        bar.set_message(format!("Mining prefix '{}' | 0 H/s | 0 attempts", prefix));
        
        Self {
            bar,
            start_time: Instant::now(),
            estimated_attempts,
        }
    }

    pub fn update(&self, attempts: u64) {
        let elapsed = self.start_time.elapsed().as_secs_f64();
        let hashrate = if elapsed > 0.0 {
            attempts as f64 / elapsed
        } else {
            0.0
        };

        let hashrate_str = format_hashrate(hashrate);
        let eta = if hashrate > 0.0 {
            let remaining = self.estimated_attempts.saturating_sub(attempts);
            let eta_secs = remaining as f64 / hashrate;
            format_duration(Duration::from_secs_f64(eta_secs))
        } else {
            "calculating...".to_string()
        };

        self.bar.set_message(format!(
            "{} | {} attempts | ETA: {}",
            hashrate_str,
            format_number(attempts),
            eta
        ));
        self.bar.tick();
    }

    pub fn finish_with_success(&self, attempts: u64) {
        let elapsed = self.start_time.elapsed();
        let hashrate = attempts as f64 / elapsed.as_secs_f64();
        
        self.bar.finish_with_message(format!(
            "✅ Found in {} ({} attempts, {})",
            format_duration(elapsed),
            format_number(attempts),
            format_hashrate(hashrate)
        ));
    }

    pub fn finish_with_message(&self, msg: &str) {
        self.bar.finish_with_message(msg.to_string());
    }
}

fn format_hashrate(hashrate: f64) -> String {
    if hashrate >= 1_000_000.0 {
        format!("{:.2} MH/s", hashrate / 1_000_000.0)
    } else if hashrate >= 1_000.0 {
        format!("{:.2} KH/s", hashrate / 1_000.0)
    } else {
        format!("{:.0} H/s", hashrate)
    }
}

fn format_number(n: u64) -> String {
    if n >= 1_000_000_000 {
        format!("{:.2}B", n as f64 / 1_000_000_000.0)
    } else if n >= 1_000_000 {
        format!("{:.2}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.2}K", n as f64 / 1_000.0)
    } else {
        format!("{}", n)
    }
}

fn format_duration(duration: Duration) -> String {
    let secs = duration.as_secs();
    if secs >= 3600 {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    } else if secs >= 60 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{}s", secs)
    }
}

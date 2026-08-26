use std::{
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};

fn strip_ansi(text: &str) -> String {
    let mut clean = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            clean.push(ch);
            continue;
        }
        if chars.next_if_eq(&'[').is_some() {
            for code in chars.by_ref() {
                if ('@'..='~').contains(&code) {
                    break;
                }
            }
        }
    }
    clean
}

fn valid_loopback_url(value: &str) -> Option<url::Url> {
    let parsed = url::Url::parse(value).ok()?;
    let host = parsed.host_str()?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !matches!(host, "localhost" | "127.0.0.1" | "::1")
        || parsed.port().is_none()
    {
        return None;
    }
    Some(parsed)
}

pub(crate) fn extract(text: &str) -> Option<String> {
    let clean = strip_ansi(text);
    let mut starts = [
        "http://localhost:",
        "https://localhost:",
        "http://127.0.0.1:",
        "https://127.0.0.1:",
        "http://[::1]:",
        "https://[::1]:",
    ]
    .into_iter()
    .flat_map(|prefix| clean.match_indices(prefix).map(|(start, _)| start))
    .collect::<Vec<_>>();
    starts.sort_unstable();

    starts.into_iter().find_map(|start| {
        let tail = &clean[start..];
        let end = tail
            .find(|ch: char| ch.is_whitespace() || matches!(ch, '"' | '\'' | ')' | '>' | ',' | ';'))
            .unwrap_or(tail.len());
        valid_loopback_url(&tail[..end]).map(|url| url.to_string())
    })
}

pub(crate) fn is_listening(value: &str) -> bool {
    let Some(parsed) = valid_loopback_url(value) else {
        return false;
    };
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let Some(port) = parsed.port() else {
        return false;
    };
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };

    addresses
        .into_iter()
        .any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_complete_loopback_url() {
        assert_eq!(
            extract("Local: http://localhost:5176/ ready"),
            Some("http://localhost:5176/".into())
        );
        assert_eq!(
            extract("Local: http://127.0.0.1:8081/path"),
            Some("http://127.0.0.1:8081/path".into())
        );
    }

    #[test]
    fn ignores_partial_and_non_loopback_urls() {
        assert_eq!(extract("Local: http://localhost:"), None);
        assert_eq!(extract("Local: http://localhost:/"), None);
        assert_eq!(extract("Local: https://example.com:5173/"), None);
    }

    #[test]
    fn handles_ansi_styled_ports() {
        assert_eq!(
            extract("Local: http://localhost:\u{1b}[1m5176\u{1b}[0m/"),
            Some("http://localhost:5176/".into())
        );
    }
}

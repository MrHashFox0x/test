import mentatLogo from '../../assets/mentat-logo.svg';

export function Footer() {
  return (
    <footer style={{
      background: 'linear-gradient(to right, oklch(0.95 0.04 76), oklch(0.95 0.02 248))',
      marginTop: '40px',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '24px 48px 20px',
      }}>
        {/* Top row: logo + nav links + social icons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          {/* Logo + brand */}
          <a href="https://mentatminds.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}>
            <img src={mentatLogo} alt="Mentat Minds" width="56" height="56" />
            <span style={{
              fontFamily: 'Chillax Variable, Chillax',
              fontWeight: 700,
              fontSize: '28px',
              color: '#3B3BF9',
            }}>
              Mentat Minds
            </span>
          </a>

          {/* Nav links + social */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <a href="#" style={navLinkStyle}>Home</a>
            <a href="#" style={navLinkStyle}>MentatLend</a>
            <a href="https://www.notion.so/mentat-minds/Lending-Borrowing-on-Bittensor-by-Mentat-Minds-2fd11a348a4e8076a4a8fce7b4c660dd" target="_blank" rel="noopener noreferrer" style={navLinkStyle}>Docs</a>

            {/* Divider */}
            <div style={{ width: '1px', height: '20px', background: 'rgba(45,45,94,0.15)' }} />

            {/* X / Twitter */}
            <a
              href="https://x.com/mentatminds"
              target="_blank"
              rel="noopener noreferrer"
              style={iconLinkStyle}
              aria-label="X / Twitter"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            {/* Discord */}
            <a
              href="https://discord.gg/cDcZvWDhK2"
              target="_blank"
              rel="noopener noreferrer"
              style={iconLinkStyle}
              aria-label="Discord"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>
        </div>

        {/* Bottom row: copyright */}
        <div style={{
          paddingTop: '12px',
          textAlign: 'right',
        }}>
          <p style={{ fontSize: '13px', color: '#8B8FAE' }}>
            &copy; 2026 Mentat Minds. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

const navLinkStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#3B3BF9',
  textDecoration: 'none',
  transition: 'opacity 0.2s',
};

const iconLinkStyle: React.CSSProperties = {
  color: '#3B3BF9',
  transition: 'opacity 0.2s',
  display: 'flex',
  alignItems: 'center',
};

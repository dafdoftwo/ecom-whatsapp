'use client';

import { useEffect, useState } from 'react';

interface NavigationProps {
  isMobile?: boolean;
}

const Navigation = ({ isMobile = false }: NavigationProps) => {
  const [currentPath, setCurrentPath] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    // Update current path on client side only
    setCurrentPath(window.location.pathname);
    
    // Listen for route changes
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', handleLocationChange);
    
    // Listen for pushstate/replacestate (for SPAs)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      handleLocationChange();
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      handleLocationChange();
    };

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  const navItems = [
    { href: '/', icon: '📊', text: 'لوحة المراقبة' },
    { href: '/orders', icon: '📦', text: 'إدارة الطلبات' },
    { href: '/settings', icon: '⚙️', text: 'الإعدادات' },
    { href: '/whatsapp-diagnostics', icon: '🔧', text: 'تشخيص النظام' }
  ];

  const isActive = (href: string) => {
    if (href === '/' && currentPath === '/') return true;
    if (href !== '/' && currentPath.startsWith(href)) return true;
    return false;
  };

  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
    // Prevent body scroll when menu is open
    document.body.style.overflow = !isMenuOpen ? 'hidden' : '';
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setIsMenuOpen(false);
      document.body.style.overflow = '';
    }
  };

  if (isMobile) {
    return (
      <>
        {/* زر قائمة الموبايل */}
        <button 
          className="mobile-menu-btn mobile-only" 
          onClick={handleMenuToggle}
          aria-label="فتح القائمة"
        >
          <span>☰</span>
        </button>

        {/* Overlay للموبايل */}
        <div 
          className={`mobile-overlay ${isMenuOpen ? 'active' : ''}`}
          onClick={() => {
            setIsMenuOpen(false);
            document.body.style.overflow = '';
          }}
        />

        {/* قائمة الموبايل المحسنة */}
        <div className={`mobile-menu ${isMenuOpen ? 'active' : ''}`}>
          {/* رأس القائمة */}
          <div className="mobile-menu-header">
            <h3>🇪🇬 القائمة الرئيسية</h3>
            <button 
              className="mobile-menu-close"
              onClick={() => {
                setIsMenuOpen(false);
                document.body.style.overflow = '';
              }}
            >
              ✕
            </button>
          </div>

          {/* محتوى القائمة */}
          <div className="mobile-menu-content">
            {/* مؤشر الحالة للموبايل */}
            <div className="status-indicator status-online" style={{ marginBottom: '1.5rem', width: '100%', justifyContent: 'center' }}>
              <span>●</span>
              نظام نشط ومتصل
            </div>

            {/* روابط التنقل */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`mobile-nav-link ${isActive(item.href) ? 'active' : ''}`}
                  onClick={handleLinkClick}
                >
                  <span className="icon">{item.icon}</span>
                  <span>{item.text}</span>
                </a>
              ))}
            </div>

            {/* معلومات إضافية */}
            <div style={{ 
              marginTop: '2rem', 
              padding: '1rem', 
              background: 'var(--gray-50)', 
              borderRadius: 'var(--border-radius)',
              textAlign: 'center',
              fontSize: '0.875rem',
              color: 'var(--gray-600)'
            }}>
              <div style={{ marginBottom: '0.5rem', fontWeight: '600' }}>نظام أتمتة الواتساب</div>
              <div>الإصدار 2.0 - محسن ومطور</div>
              <div style={{ 
                marginTop: '0.75rem', 
                padding: '0.5rem', 
                background: 'linear-gradient(135deg, var(--primary-light), rgba(124, 58, 237, 0.1))',
                borderRadius: 'calc(var(--border-radius) / 2)',
                fontSize: '0.75rem',
                fontWeight: '500'
              }}>
                ✨ تصميم احترافي جديد
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Desktop navigation
  return (
    <ul className="navbar-nav desktop-only">
      {navItems.map((item) => (
        <li key={item.href}>
          <a
            href={item.href}
            className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
          >
            <span className="icon">{item.icon}</span>
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
};

export default Navigation; 
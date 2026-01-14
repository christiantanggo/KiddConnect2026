'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import OrganizationSelectionModal from './OrganizationSelectionModal';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');

/**
 * V2AuthGuard - Enhanced auth guard for v2 dashboard
 * 
 * Handles:
 * - Authentication check
 * - Organization selection flow (per spec)
 * - Legal acceptance check
 */
export default function V2AuthGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [needsTermsAcceptance, setNeedsTermsAcceptance] = useState(false);
  const checkingRef = useRef(false); // Prevent concurrent checks
  const lastPathnameRef = useRef(pathname); // Track last pathname to prevent duplicate checks
  const termsCheckedRef = useRef(false); // Prevent repeated terms checks

  useEffect(() => {
    // Only check on initial mount, not on every pathname change
    // This prevents infinite reload loops
    let mounted = true;
    
    if (!authChecked && !checkingRef.current && mounted) {
      checkAuthAndSetup();
    }
    
    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array - only run once on mount

  const getAuthHeaders = () => {
    if (typeof document === 'undefined') return {};
    const cookies = document.cookie.split(';');
    const tokenCookie = cookies.find(c => c.trim().startsWith('token='));
    const token = tokenCookie ? tokenCookie.split('=')[1] : null;
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const checkAuthAndSetup = async () => {
    // Prevent concurrent checks
    if (checkingRef.current) {
      console.log('[V2AuthGuard] Already checking, skipping...');
      return;
    }
    
    checkingRef.current = true;
    console.log('[V2AuthGuard] Starting auth check...');
    
    try {
      // Check authentication first
      if (!isAuthenticated()) {
        console.log('[V2AuthGuard] Not authenticated, redirecting to login');
        router.push('/login');
        return;
      }

      console.log('[V2AuthGuard] Authenticated, checking setup...');
      setAuthChecked(true);

      // Load organizations - only if not already loaded
      if (organizations.length === 0 && !currentOrg) {
        console.log('[V2AuthGuard] Loading organizations...');
        const headers = getAuthHeaders();
        const orgsRes = await fetch(`${API_URL}/api/v2/organizations`, { headers });
        
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json();
          const orgs = orgsData.organizations || [];
          setOrganizations(orgs);

          // Handle organization selection per spec:
          // 0 organizations -> force setup wizard (show modal with message)
          // 1 organization -> auto-select (only if not already selected)
          // >1 organization -> show selection modal
          if (orgs.length === 0) {
            setShowOrgModal(true);
          } else if (orgs.length === 1) {
            // Auto-select single organization (only if not already selected)
            const activeBusinessId = typeof window !== 'undefined' 
              ? localStorage.getItem('activeBusinessId') 
              : null;
            
            if (activeBusinessId === orgs[0].id && currentOrg?.id === orgs[0].id) {
              // Already selected, just load it
              await loadCurrentOrganization(orgs[0].id);
            } else if (activeBusinessId !== orgs[0].id) {
              // Not selected yet, select it
              await selectOrganization(orgs[0].id);
            }
          } else {
            // Multiple organizations - check if one is already selected
            const activeBusinessId = typeof window !== 'undefined' 
              ? localStorage.getItem('activeBusinessId') 
              : null;
            
            if (!activeBusinessId || !orgs.find(o => o.id === activeBusinessId)) {
              setShowOrgModal(true);
            } else {
              await loadCurrentOrganization(activeBusinessId);
            }
          }
        } else if (orgsRes.status === 401 || orgsRes.status === 403) {
          // Auth failed - redirect to login
          router.push('/login');
          return;
        }
        // If API fails for other reasons, continue anyway to avoid blocking
      } else if (currentOrg) {
        // Already have org loaded, skip
      }

      // Check legal acceptance - only once
      if (!termsCheckedRef.current) {
        await checkLegalAcceptance();
      }

    } catch (err) {
      console.error('[V2AuthGuard] Error:', err);
    } finally {
      setLoading(false);
      checkingRef.current = false; // Reset checking flag
      console.log('[V2AuthGuard] Auth check complete');
    }
  };

  const selectOrganization = async (businessId) => {
    // Prevent re-selecting if already selected
    if (currentOrg?.id === businessId) {
      return;
    }
    
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${API_URL}/api/v2/organizations/select`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ business_id: businessId }),
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentOrg(data.organization);
        if (typeof window !== 'undefined') {
          localStorage.setItem('activeBusinessId', businessId);
        }
        setShowOrgModal(false);
        // DON'T call router.refresh() - it causes infinite reload loops
        // The state update is enough to trigger a re-render
      }
    } catch (err) {
      console.error('[V2AuthGuard] Error selecting organization:', err);
    }
  };

  const loadCurrentOrganization = async (businessId) => {
    try {
      const headers = getAuthHeaders();
      headers['X-Active-Business-Id'] = businessId;
      const res = await fetch(`${API_URL}/api/v2/organizations/current`, { headers });

      if (res.ok) {
        const data = await res.json();
        if (data.organization) {
          setCurrentOrg(data.organization);
        }
      }
    } catch (err) {
      console.error('[V2AuthGuard] Error loading current org:', err);
    }
  };

  const checkLegalAcceptance = async () => {
    // Only check once to prevent loops
    if (termsCheckedRef.current || pathname === '/accept-terms') {
      return;
    }
    
    termsCheckedRef.current = true;
    
    try {
      const headers = getAuthHeaders();
      const businessId = typeof window !== 'undefined' 
        ? localStorage.getItem('activeBusinessId') 
        : null;
      
      if (businessId) {
        headers['X-Active-Business-Id'] = businessId;
      }

      // Try to access a protected endpoint to check legal acceptance
      // If it returns 403 with TERMS_NOT_ACCEPTED, redirect to accept-terms
      const testRes = await fetch(`${API_URL}/api/v2/modules`, { headers });
      
      if (testRes.status === 403) {
        const errorData = await testRes.json();
        if (errorData.code === 'TERMS_NOT_ACCEPTED') {
          setNeedsTermsAcceptance(true);
          const returnUrl = encodeURIComponent(pathname);
          router.push(`/accept-terms?return=${returnUrl}`);
        }
      }
    } catch (err) {
      // If check fails, allow through (better UX than blocking)
      console.warn('[V2AuthGuard] Legal acceptance check failed:', err);
      termsCheckedRef.current = false; // Reset on error so it can retry
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
      </div>
    );
  }

  // Show organization selection modal if needed
  if (showOrgModal) {
    return (
      <OrganizationSelectionModal
        organizations={organizations}
        onSelect={(org) => {
          setCurrentOrg(org);
          setShowOrgModal(false);
        }}
        onClose={() => {
          // If user closes modal, redirect to login
          router.push('/login');
        }}
      />
    );
  }

  // Don't render children if terms not accepted (redirect will happen)
  if (needsTermsAcceptance) {
    return null;
  }

  return <>{children}</>;
}



'use client';

import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import Link from 'next/link';

export default function ModuleActivationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  moduleName,
  moduleKey 
}) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activating, setActivating] = useState(false);

  // Reset terms acceptance when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTermsAccepted(false);
      setActivating(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!termsAccepted || activating) return;
    
    setActivating(true);
    try {
      await onConfirm();
    } catch (error) {
      setActivating(false);
      throw error; // Re-throw to let parent handle
    }
  };

  const handleClose = () => {
    if (activating) return; // Don't allow closing while activating
    setTermsAccepted(false);
    setActivating(false);
    onClose();
  };

  // Get module-specific terms URLs
  const termsUrl = moduleKey ? `/legal/modules/${moduleKey}/terms` : `/legal/terms`;
  const privacyUrl = moduleKey ? `/legal/modules/${moduleKey}/privacy` : `/legal/privacy`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        style={{
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center rounded-t-lg">
          <h2 className="text-xl font-bold text-gray-900">Confirm Activation</h2>
          {!activating && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-800 mb-6">
            Are you sure you want to activate <strong>{moduleName}</strong>?
          </p>
          
          <p className="text-sm text-gray-600 mb-6">
            By activating this module, you agree to our Terms of Service and Privacy Policy. 
            Activation will begin your subscription and billing will start immediately.
          </p>

          {/* Terms Links */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-700 mb-3">
              <strong>Please review:</strong>
            </p>
            <div className="space-y-2">
              <Link 
                href={termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline block"
                onClick={(e) => e.stopPropagation()}
              >
                → Terms of Service
              </Link>
              <Link 
                href={privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 underline block"
                onClick={(e) => e.stopPropagation()}
              >
                → Privacy Policy
              </Link>
            </div>
          </div>

          {/* Terms Checkbox */}
          <div className="mb-6">
            <label className="flex items-start cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                disabled={activating}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                style={{ cursor: activating ? 'not-allowed' : 'pointer' }}
              />
              <span className="ml-3 text-sm text-gray-700">
                I have read and agree to the{' '}
                <Link 
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link 
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </Link>
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={handleClose}
            disabled={activating}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!termsAccepted || activating}
            className="px-6 py-2 text-white font-medium rounded-md transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: !termsAccepted || activating ? 'var(--color-text-muted)' : 'var(--color-accent)',
            }}
            onMouseEnter={(e) => {
              if (!(!termsAccepted || activating)) {
                e.target.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              if (!(!termsAccepted || activating)) {
                e.target.style.opacity = '1';
              }
            }}
          >
            {activating ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" /> Activating...
              </>
            ) : (
              'Yes, Activate'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


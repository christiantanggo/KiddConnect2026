'use client';

import { useState, useEffect } from 'react';
import { billingAPI, modulesAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PricingModal({ isOpen, onClose, module = null }) {
  const router = useRouter();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (module && module.metadata?.pricing) {
        // Show module-specific pricing
        loadModulePricing();
      } else {
        // Show Phone Agent packages
        loadPackages();
      }
    }
  }, [isOpen, module]);

  const loadModulePricing = () => {
    setLoading(true);
    try {
      const pricing = module.metadata.pricing;
      // Create a synthetic package from module pricing
      const syntheticPackage = {
        id: module.key,
        name: module.name,
        description: module.description || `Get started with ${module.name}`,
        monthly_price: (pricing.monthly_price_cents / 100).toFixed(2),
        minutes_included: pricing.usage_limit || 'Unlimited',
        module_key: module.key,
        is_module: true
      };
      setPackages([syntheticPackage]);
      setSelectedPackage(syntheticPackage);
    } catch (error) {
      console.error('Failed to load module pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPackages = async () => {
    try {
      setLoading(true);
      const response = await billingAPI.getPackages();
      setPackages(response.data.packages || []);
    } catch (error) {
      console.error('Failed to load packages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {module ? `${module.name} Pricing` : 'Choose Your Package'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading packages...</p>
            </div>
          ) : packages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No packages available at this time. Please contact support.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-6">Select a package that fits your needs</p>
              <div 
                className={`flex flex-wrap justify-center gap-4 mb-6 ${
                  packages.length === 1 
                    ? 'grid grid-cols-1 max-w-sm mx-auto' 
                    : packages.length === 2 
                    ? 'grid grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto' 
                    : 'grid grid-cols-1 md:grid-cols-3'
                }`}
              >
                {packages.map((pkg) => {
                  const isOnSale = pkg.isOnSale && pkg.saleAvailable;
                  const saleBorderColor = isOnSale ? 'border-orange-500' : '';
                  const normalBorderColor = selectedPackage?.id === pkg.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300';
                  
                  return (
                    <div
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg)}
                      className={`cursor-pointer p-6 border-2 rounded-lg transition-all relative ${
                        isOnSale ? saleBorderColor : normalBorderColor
                      } ${selectedPackage?.id === pkg.id && !isOnSale ? 'bg-blue-50' : ''}`}
                    >
                      {isOnSale && pkg.sale_name && (
                        <div className="absolute -top-3 left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                          {pkg.sale_name}
                        </div>
                      )}
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{pkg.name}</h3>
                      <div className="mb-2">
                        {isOnSale && pkg.sale_price ? (
                          <>
                            <p className="text-2xl font-bold text-blue-600">
                              ${(parseFloat(pkg.sale_price) || 0).toFixed(2)}/month
                            </p>
                            <p className="text-sm text-gray-400 line-through">
                              ${(parseFloat(pkg.monthly_price) || 0).toFixed(2)}/month
                            </p>
                          </>
                        ) : (
                          <p className="text-2xl font-bold text-blue-600">
                            ${(parseFloat(pkg.monthly_price) || 0).toFixed(2)}/month
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{pkg.description}</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        {pkg.is_module ? (
                          <div>
                            {typeof pkg.minutes_included === 'number' 
                              ? `${pkg.minutes_included} generations included per month`
                              : pkg.minutes_included === 'Unlimited'
                              ? 'Unlimited generations'
                              : `${pkg.minutes_included} generations per month`}
                          </div>
                        ) : (
                          <>
                            <div>
                              {pkg.minutes_included ? `${pkg.minutes_included} minutes included` : 'Unlimited minutes'}
                            </div>
                            {pkg.sms_included !== undefined && pkg.sms_included !== null && (
                              <div>
                                {pkg.sms_included > 0 ? `${pkg.sms_included} SMS included` : 'No SMS included'}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {isOnSale && pkg.sale_max_quantity && (
                        <div className="text-xs text-orange-600 font-semibold mt-2">
                          Limited Number
                        </div>
                      )}
                      {isOnSale && pkg.sale_duration_months && pkg.sale_name && (
                        <div className="text-xs text-orange-600 font-semibold mt-1">
                          "{pkg.sale_name}" special valid for {pkg.sale_duration_months} {pkg.sale_duration_months === 1 ? 'month' : 'months'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {selectedPackage && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
                  <p className="text-sm text-blue-800 mb-4">
                    <strong>Selected:</strong> {selectedPackage.name} - {
                      (selectedPackage.isOnSale && selectedPackage.saleAvailable && selectedPackage.sale_price) 
                        ? `$${(parseFloat(selectedPackage.sale_price) || 0).toFixed(2)}/month`
                        : `$${(parseFloat(selectedPackage.monthly_price) || 0).toFixed(2)}/month`
                    }
                  </p>
                </div>
              )}

              {/* CTA Button */}
              <div className="flex justify-center mt-6">
                {module && module.key ? (
                  <button
                    onClick={async () => {
                      try {
                        setActivating(true);
                        const response = await modulesAPI.activate(module.key);
                        onClose();
                        if (response.data.redirect_to) {
                          router.push(response.data.redirect_to);
                        } else {
                          router.push(`/modules/${module.key}/setup`);
                        }
                      } catch (error) {
                        console.error('Failed to activate module:', error);
                        alert(error.response?.data?.message || 'Failed to activate module. Please try again.');
                        setActivating(false);
                      }
                    }}
                    disabled={activating}
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {activating ? 'Activating...' : 'Activate Module'}
                  </button>
                ) : (
                  <Link
                    href="/signup"
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
                    onClick={onClose}
                  >
                    Get Started
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


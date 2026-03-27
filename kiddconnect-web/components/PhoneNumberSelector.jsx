'use client';

import { useState, useEffect } from 'react';
import { phoneNumbersAPI } from '@/lib/api';

export default function PhoneNumberSelector({ onSelect, selectedNumber, countryCode = 'US' }) {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(countryCode);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualNumber, setManualNumber] = useState('');

  const countries = [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'AU', name: 'Australia' },
  ];

  const searchNumbers = async () => {
    setSearching(true);
    setError(null);
    try {
      const res = await phoneNumbersAPI.search({
        countryCode: selectedCountry,
        phoneCategoryName: 'GEOGRAPHIC',
        count: 20,
      });
      setNumbers(res.data.numbers || []);
      if (res.data.numbers.length === 0) {
        setError('No phone numbers available for this country. Try a different country.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to search phone numbers');
      setNumbers([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    // Auto-search on mount
    searchNumbers();
  }, [selectedCountry]);

  const formatPrice = (price) => {
    if (!price) return 'Price not available';
    return `$${parseFloat(price).toFixed(2)}/month`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={searchNumbers}
            disabled={searching}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? 'Searching...' : 'Refresh Numbers'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800 mb-2">
            <strong>Limited Availability:</strong> {error}
          </p>
          <p className="text-xs text-yellow-700 mb-3">
            Phone number inventory can be limited. If you already have a phone number in your Voximplant account, you can enter it manually below.
          </p>
          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="text-sm text-yellow-800 underline hover:text-yellow-900"
          >
            {showManualEntry ? 'Hide' : 'Enter phone number manually'}
          </button>
        </div>
      )}

      {!error && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            {showManualEntry ? 'Hide manual entry' : 'Or enter phone number manually'}
          </button>
        </div>
      )}

      {showManualEntry && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Enter Phone Number (E.164 format, e.g., +12014840333)
          </label>
          <input
            type="tel"
            value={manualNumber}
            onChange={(e) => setManualNumber(e.target.value)}
            placeholder="+12014840333"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
          <p className="text-xs text-gray-600 mt-2">
            Enter a phone number that is already in your Voximplant account. It will be bound to your application.
          </p>
          {manualNumber && (
            <button
              onClick={() => {
                onSelect(manualNumber);
                setShowManualEntry(false);
              }}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm"
            >
              Use This Number
            </button>
          )}
        </div>
      )}

      {searching && numbers.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600">Searching for available phone numbers...</p>
        </div>
      )}

      {!searching && numbers.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Select a phone number for your AI agent. This number will receive calls.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            {numbers.map((number) => (
              <button
                key={number.phone_number}
                onClick={() => onSelect(number.phone_number)}
                className={`p-4 border-2 rounded-lg text-left transition ${
                  selectedNumber === number.phone_number
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-300 hover:border-blue-400 bg-white'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{number.phone_number}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {number.country_code} • {formatPrice(number.phone_price)}
                    </p>
                    {number.can_send_sms && (
                      <span className="inline-block mt-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        SMS Available
                      </span>
                    )}
                  </div>
                  {selectedNumber === number.phone_number && (
                    <svg
                      className="w-6 h-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!searching && numbers.length === 0 && !error && (
        <div className="text-center py-8">
          <p className="text-gray-600">Click "Refresh Numbers" to search for available phone numbers.</p>
        </div>
      )}
    </div>
  );
}


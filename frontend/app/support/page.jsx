'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
      const response = await fetch(`${API_URL}/api/support/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Success!
      setSubmitted(true);
      setSubmitting(false);
    } catch (error) {
      console.error('Error submitting contact form:', error);
      alert(error.message || 'Failed to send message. Please try again later.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="flex items-center">
              <Image
                src="/tavari-logo.png"
                alt="Tavari AI"
                width={400}
                height={114}
                className="h-28 w-auto"
                style={{ width: 'auto', height: '7rem' }}
                priority
              />
            </Link>
            <div className="flex items-center space-x-6">
              <Link href="/" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Home
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/login" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Customer Support
          </h1>
          <p className="text-xl text-gray-600">
            We're here to help you get the most out of Tavari
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Get in Touch</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Email Support</h3>
                <a 
                  href="mailto:info@tanggo.ca" 
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  info@tanggo.ca
                </a>
                <p className="text-sm text-gray-600 mt-1">We typically respond within 24 hours</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Business Hours</h3>
                <p className="text-gray-600">Monday - Friday: 9:00 AM - 5:00 PM EST</p>
                <p className="text-sm text-gray-500 mt-1">Support requests sent outside business hours will be responded to on the next business day</p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Account Support</h3>
                <p className="text-gray-600 mb-2">For account-specific questions, please log in to your dashboard:</p>
                <Link 
                  href="/login" 
                  className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
                >
                  Login to Dashboard →
                </Link>
              </div>
            </div>
          </div>

          {/* Support Form */}
          <div className="bg-white rounded-lg shadow-sm p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Send Us a Message</h2>
            
            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="text-green-600 text-5xl mb-4">✓</div>
                <h3 className="text-lg font-semibold text-green-900 mb-2">Message Sent!</h3>
                <p className="text-green-700">
                  We'll get back to you at <strong>{formData.email}</strong> as soon as possible.
                </p>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setFormData({ name: '', email: '', subject: '', message: '' });
                  }}
                  className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject *
                  </label>
                  <select
                    id="subject"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a topic...</option>
                    <option value="technical">Technical Support</option>
                    <option value="billing">Billing & Payments</option>
                    <option value="account">Account Issues</option>
                    <option value="feature">Feature Request</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                    Message *
                  </label>
                  <textarea
                    id="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Please describe your question or issue..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Frequently Asked Questions</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How do I get started with Tavari?</h3>
              <p className="text-gray-600">
                Getting started is easy! Simply <Link href="/signup" className="text-blue-600 hover:underline">create an account</Link>, 
                complete our quick setup wizard, and your AI phone agent will be ready to answer calls in minutes.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">What if I need help with my account?</h3>
              <p className="text-gray-600">
                If you're already a customer, you can access your account dashboard by <Link href="/login" className="text-blue-600 hover:underline">logging in</Link>. 
                From there, you can manage your settings, view your usage, and access additional support resources.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How do I cancel or change my subscription?</h3>
              <p className="text-gray-600">
                You can manage your subscription, update your payment method, or cancel anytime from your account dashboard. 
                Simply log in and go to the Billing section.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">What are your business hours?</h3>
              <p className="text-gray-600">
                Our support team is available Monday through Friday, 9:00 AM to 5:00 PM EST. 
                However, your AI phone agent works 24/7 to answer customer calls!
              </p>
            </div>
          </div>
        </div>

        {/* Additional Resources */}
        <div className="bg-blue-50 rounded-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Need More Help?</h2>
          <p className="text-gray-600 mb-6">
            Check out our legal pages for more information about our service
          </p>
          <div className="flex justify-center space-x-6">
            <Link 
              href="/terms" 
              className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
              Terms of Service
            </Link>
            <span className="text-gray-300">|</span>
            <Link 
              href="/privacy" 
              className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-gray-600">
            <p>&copy; {new Date().getFullYear()} Tavari. All rights reserved.</p>
            <p className="mt-2 text-sm">
              Need support? Email us at <a href="mailto:info@tanggo.ca" className="text-blue-600 hover:underline">info@tanggo.ca</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}


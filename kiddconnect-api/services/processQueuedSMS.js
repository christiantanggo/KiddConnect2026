// services/processQueuedSMS.js
// Process queued SMS recipients that were blocked by quiet hours

import { SMSCampaignRecipient } from '../models/SMSCampaignRecipient.js';
import { SMSCampaign } from '../models/SMSCampaign.js';
import { Business } from '../models/Business.js';
import { sendSMSDirect, addBusinessIdentification } from './notifications.js';
import { getAvailableSMSNumbers, loadBalanceMessages } from './bulkSMS.js';
import { formatPhoneNumberE164 } from '../utils/phoneFormatter.js';
import { getTimezoneFromPhoneNumber, checkQuietHours } from '../utils/timezoneDetector.js';
import { SMSOptOut } from '../models/SMSOptOut.js';

/**
 * Process queued SMS recipients that are ready to send
 * This function should be called periodically (e.g., every 5-10 minutes) to send queued messages
 * @returns {Promise<Object>} Processing results
 */
export async function processQueuedSMS() {
  console.log(`[ProcessQueuedSMS] ========== STARTING QUEUED SMS PROCESSING ==========`);
  const startTime = Date.now();
  
  try {
    // Find all queued recipients ready to send
    const queuedRecipients = await SMSCampaignRecipient.findReadyToSend();
    
    if (queuedRecipients.length === 0) {
      console.log(`[ProcessQueuedSMS] No queued recipients ready to send`);
      return {
        processed: 0,
        sent: 0,
        failed: 0,
        stillQueued: 0,
      };
    }
    
    console.log(`[ProcessQueuedSMS] Found ${queuedRecipients.length} queued recipient(s) ready to send`);
    
    // Group recipients by campaign
    const recipientsByCampaign = new Map();
    for (const recipient of queuedRecipients) {
      if (!recipientsByCampaign.has(recipient.campaign_id)) {
        recipientsByCampaign.set(recipient.campaign_id, []);
      }
      recipientsByCampaign.get(recipient.campaign_id).push(recipient);
    }
    
    console.log(`[ProcessQueuedSMS] Processing ${recipientsByCampaign.size} campaign(s)`);
    
    let totalSent = 0;
    let totalFailed = 0;
    let totalStillQueued = 0;
    
    // Process each campaign
    for (const [campaignId, recipients] of recipientsByCampaign) {
      try {
        // Get campaign details
        const campaign = await SMSCampaign.findById(campaignId);
        if (!campaign) {
          console.error(`[ProcessQueuedSMS] Campaign ${campaignId} not found, skipping recipients`);
          continue;
        }
        
        // Get business
        const business = await Business.findById(campaign.business_id);
        if (!business) {
          console.error(`[ProcessQueuedSMS] Business ${campaign.business_id} not found, skipping campaign`);
          continue;
        }
        
        // Check if quiet hours are still enabled
        if (!business.sms_business_hours_enabled) {
          // Quiet hours disabled, send all queued recipients immediately
          console.log(`[ProcessQueuedSMS] Quiet hours disabled for business ${business.id}, sending all queued recipients`);
        }
        
        // Get available SMS numbers
        const availableNumbers = await getAvailableSMSNumbers(campaign.business_id);
        if (availableNumbers.length === 0) {
          console.error(`[ProcessQueuedSMS] No SMS numbers available for business ${campaign.business_id}`);
          continue;
        }
        
        // Check opt-outs
        const optOuts = await SMSOptOut.findByBusinessId(campaign.business_id);
        const optOutSet = new Set(optOuts.map(o => {
          try {
            return formatPhoneNumberE164(o.phone_number);
          } catch {
            return o.phone_number;
          }
        }));
        
        // Process each recipient
        for (const recipient of recipients) {
          try {
            // Double-check quiet hours (in case settings changed)
            // Use BUSINESS timezone (universal timezone), not recipient timezone
            if (business.sms_business_hours_enabled) {
              const businessTimezone = business.sms_timezone || business.timezone || 'America/New_York';
              const check = checkQuietHours(
                businessTimezone,
                parseInt((business.sms_allowed_start_time || '09:00').split(':')[0]),
                parseInt((business.sms_allowed_end_time || '20:00').split(':')[0])
              );
              
              if (check.isWithinQuietHours) {
                // Still in quiet hours, reschedule for next allowed time
                const scheduledSend = new Date(check.currentTime);
                scheduledSend.setHours(parseInt((business.sms_allowed_start_time || '09:00').split(':')[0]), 0, 0, 0);
                if (scheduledSend <= check.currentTime) {
                  scheduledSend.setDate(scheduledSend.getDate() + 1);
                }
                
                await SMSCampaignRecipient.updateStatus(recipient.id, 'queued', {
                  scheduled_send_at: scheduledSend.toISOString(),
                });
                totalStillQueued++;
                continue;
              }
            }
            
            // Check opt-out
            const normalizedPhone = formatPhoneNumberE164(recipient.phone_number);
            if (optOutSet.has(normalizedPhone) || optOutSet.has(recipient.phone_number)) {
              console.log(`[ProcessQueuedSMS] Recipient ${recipient.phone_number} is opted out, skipping`);
              await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
                error_message: 'Recipient opted out',
              });
              totalFailed++;
              continue;
            }
            
            // Load balance to get sending number
            const assignments = loadBalanceMessages([recipient.phone_number], availableNumbers);
            if (assignments.length === 0) {
              console.error(`[ProcessQueuedSMS] No assignment for ${recipient.phone_number}`);
              await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
                error_message: 'No available phone number for sending',
              });
              totalFailed++;
              continue;
            }
            
            const assignment = assignments[0];
            
            // Add business identification and send
            const messageWithBusiness = addBusinessIdentification(campaign.message_text, business.name);
            const response = await sendSMSDirect(assignment.fromNumber, recipient.phone_number, messageWithBusiness);
            
            // Update recipient status
            await SMSCampaignRecipient.updateStatus(recipient.id, 'sent', {
              telnyx_message_id: response.data?.id || null,
              sent_at: new Date().toISOString(),
            });
            
            totalSent++;
            console.log(`[ProcessQueuedSMS] ✅ Sent queued message to ${recipient.phone_number}`);
            
          } catch (error) {
            console.error(`[ProcessQueuedSMS] Error sending to ${recipient.phone_number}:`, error.message);
            await SMSCampaignRecipient.updateStatus(recipient.id, 'failed', {
              error_message: error.message,
            });
            totalFailed++;
          }
        }
        
        // Update campaign stats
        const stats = await SMSCampaignRecipient.getCampaignStats(campaignId);
        await SMSCampaign.update(campaignId, {
          sent_count: stats.sent,
          failed_count: stats.failed,
        });
        
      } catch (error) {
        console.error(`[ProcessQueuedSMS] Error processing campaign ${campaignId}:`, error.message);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[ProcessQueuedSMS] ========== COMPLETED ==========`);
    console.log(`[ProcessQueuedSMS] Processed: ${queuedRecipients.length} recipients`);
    console.log(`[ProcessQueuedSMS] Sent: ${totalSent}`);
    console.log(`[ProcessQueuedSMS] Failed: ${totalFailed}`);
    console.log(`[ProcessQueuedSMS] Still Queued: ${totalStillQueued}`);
    console.log(`[ProcessQueuedSMS] Duration: ${duration}s`);
    
    return {
      processed: queuedRecipients.length,
      sent: totalSent,
      failed: totalFailed,
      stillQueued: totalStillQueued,
    };
    
  } catch (error) {
    console.error(`[ProcessQueuedSMS] ❌ CRITICAL ERROR:`, error);
    throw error;
  }
}


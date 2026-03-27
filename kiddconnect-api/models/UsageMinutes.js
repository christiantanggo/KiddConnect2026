import { supabaseClient } from '../config/database.js';

export class UsageMinutes {
  static async create(data) {
    const {
      business_id,
      call_session_id,
      minutes_used,
      date,
      month,
      year,
      billing_cycle_start,
      billing_cycle_end,
    } = data;
    
    // Build insert object, only include columns that exist
    const insertData = {
      business_id,
      call_session_id,
      minutes_used,
      date,
      month,
      year,
    };
    
    // Only add billing cycle columns if provided (they may not exist in DB yet)
    if (billing_cycle_start !== undefined) {
      insertData.billing_cycle_start = billing_cycle_start instanceof Date 
        ? billing_cycle_start.toISOString().split('T')[0] 
        : billing_cycle_start;
    }
    if (billing_cycle_end !== undefined) {
      insertData.billing_cycle_end = billing_cycle_end instanceof Date 
        ? billing_cycle_end.toISOString().split('T')[0] 
        : billing_cycle_end;
    }
    
    const { data: usage, error } = await supabaseClient
      .from('usage_minutes')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      // If error is about missing columns, try without them
      if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
        console.warn('⚠️ Billing cycle columns missing, inserting without them. Run RUN_THIS_MIGRATION.sql');
        const { data: usage2, error: error2 } = await supabaseClient
          .from('usage_minutes')
          .insert({
            business_id,
            call_session_id,
            minutes_used,
            date,
            month,
            year,
          })
          .select()
          .single();
        if (error2) throw error2;
        return usage2;
      }
      throw error;
    }
    return usage;
  }
  
  static async getMonthlyUsage(business_id, year, month) {
    const { data, error } = await supabaseClient
      .from('usage_minutes')
      .select('minutes_used')
      .eq('business_id', business_id)
      .eq('year', year)
      .eq('month', month);
    
    if (error) throw error;
    
    const total = data?.reduce((sum, row) => sum + parseFloat(row.minutes_used || 0), 0) || 0;
    return total;
  }
  
  static async getCurrentMonthUsage(business_id) {
    const now = new Date();
    return this.getMonthlyUsage(business_id, now.getFullYear(), now.getMonth() + 1);
  }

  static async findByCallSessionId(call_session_id) {
    try {
      const { data, error } = await supabaseClient
        .from('usage_minutes')
        .select('*')
        .eq('call_session_id', call_session_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    } catch (error) {
      console.error('[UsageMinutes] Error finding usage by call_session_id:', error);
      return null;
    }
  }

  static async getCurrentCycleUsage(business_id, cycleStart, cycleEnd) {
    console.log(`[UsageMinutes] ========== GET CURRENT CYCLE USAGE START ==========`);
    console.log(`[UsageMinutes] business_id: ${business_id}`);
    console.log(`[UsageMinutes] cycleStart: ${cycleStart}`);
    console.log(`[UsageMinutes] cycleEnd: ${cycleEnd}`);
    
    const cycleStartStr = cycleStart instanceof Date ? cycleStart.toISOString().split('T')[0] : cycleStart;
    const cycleEndStr = cycleEnd instanceof Date ? cycleEnd.toISOString().split('T')[0] : cycleEnd;
    
    console.log(`[UsageMinutes] Querying for date range: ${cycleStartStr} to ${cycleEndStr}`);
    
    // Always use date-based query - it's the most reliable
    // The date column represents when the usage occurred, which should fall within the billing cycle
    const { data, error } = await supabaseClient
      .from('usage_minutes')
      .select('minutes_used, date, created_at')
      .eq('business_id', business_id)
      .gte('date', cycleStartStr)
      .lte('date', cycleEndStr);
    
    if (error) {
      console.error(`[UsageMinutes] ❌❌❌ Database query error:`, error);
      console.error(`[UsageMinutes] Error message:`, error.message);
      console.error(`[UsageMinutes] Error code:`, error.code);
      throw error;
    }
    
    console.log(`[UsageMinutes] Found ${data?.length || 0} usage records`);
    if (data && data.length > 0) {
      console.log(`[UsageMinutes] Sample records:`, JSON.stringify(data.slice(0, 3), null, 2));
    }
    
    const totalMinutes = data?.reduce((sum, row) => {
      const minutes = parseFloat(row.minutes_used || 0);
      console.log(`[UsageMinutes] Adding ${minutes} minutes from record (date: ${row.date})`);
      return sum + minutes;
    }, 0) || 0;
    
    console.log(`[UsageMinutes] Total minutes calculated: ${totalMinutes}`);
    
    // Get business to calculate overage
    const { Business } = await import('./Business.js');
    const business = await Business.findById(business_id);
    const planLimit = business?.usage_limit_minutes || 0;
    const bonusMinutes = business?.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const overageMinutes = Math.max(0, totalMinutes - totalAvailable);
    
    const result = {
      totalMinutes,
      overageMinutes,
      minutesUsed: totalMinutes - overageMinutes,
      minutesRemaining: Math.max(0, totalAvailable - totalMinutes),
      billing_cycle_start: cycleStart,
      billing_cycle_end: cycleEnd,
      minutes_total: totalAvailable,
    };
    
    console.log(`[UsageMinutes] Result:`, JSON.stringify(result, null, 2));
    console.log(`[UsageMinutes] ========== GET CURRENT CYCLE USAGE SUCCESS ==========`);
    
    return result;
  }

  static async getUsageTrends(business_id, months = 6) {
    const now = new Date();
    const trends = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      const usage = await this.getMonthlyUsage(business_id, year, month);
      
      trends.push({
        year,
        month,
        monthName: date.toLocaleString('default', { month: 'long' }),
        minutes: usage,
      });
    }
    
    return trends;
  }
}

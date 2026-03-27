// utils/timezoneDetector.js
// Timezone detection from phone number area code

/**
 * Map of US area codes to timezones
 * This is a simplified mapping - some area codes span multiple timezones
 * For accuracy, we use the most common timezone for each area code
 */
const AREA_CODE_TO_TIMEZONE = {
  // Eastern Time (ET)
  '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
  '205': 'America/Chicago', '206': 'America/Los_Angeles', '207': 'America/New_York',
  '208': 'America/Denver', '209': 'America/Los_Angeles', '210': 'America/Chicago',
  '212': 'America/New_York', '213': 'America/Los_Angeles', '214': 'America/Chicago',
  '215': 'America/New_York', '216': 'America/New_York', '217': 'America/Chicago',
  '218': 'America/Chicago', '219': 'America/Chicago', '224': 'America/Chicago',
  '225': 'America/Chicago', '226': 'America/Toronto', '228': 'America/Chicago',
  '229': 'America/New_York', '231': 'America/New_York', '234': 'America/New_York',
  '239': 'America/New_York', '240': 'America/New_York', '248': 'America/New_York',
  '251': 'America/Chicago', '252': 'America/New_York', '253': 'America/Los_Angeles',
  '254': 'America/Chicago', '256': 'America/Chicago', '260': 'America/New_York',
  '262': 'America/Chicago', '267': 'America/New_York', '269': 'America/New_York',
  '270': 'America/Chicago', '272': 'America/New_York', '274': 'America/Chicago',
  '276': 'America/New_York', '281': 'America/Chicago', '283': 'America/New_York',
  '301': 'America/New_York', '302': 'America/New_York', '303': 'America/Denver',
  '304': 'America/New_York', '305': 'America/New_York', '307': 'America/Denver',
  '308': 'America/Chicago', '309': 'America/Chicago', '310': 'America/Los_Angeles',
  '312': 'America/Chicago', '313': 'America/New_York', '314': 'America/Chicago',
  '315': 'America/New_York', '316': 'America/Chicago', '317': 'America/New_York',
  '318': 'America/Chicago', '319': 'America/Chicago', '320': 'America/Chicago',
  '321': 'America/New_York', '323': 'America/Los_Angeles', '325': 'America/Chicago',
  '326': 'America/New_York', '327': 'America/Chicago', '330': 'America/New_York',
  '331': 'America/Chicago', '332': 'America/New_York', '334': 'America/Chicago',
  '336': 'America/New_York', '337': 'America/Chicago', '339': 'America/New_York',
  '341': 'America/Los_Angeles', '346': 'America/Chicago', '347': 'America/New_York',
  '351': 'America/New_York', '352': 'America/New_York', '360': 'America/Los_Angeles',
  '361': 'America/Chicago', '364': 'America/Chicago', '365': 'America/Toronto',
  '380': 'America/New_York', '385': 'America/Denver', '386': 'America/New_York',
  '401': 'America/New_York', '402': 'America/Chicago', '403': 'America/Edmonton',
  '404': 'America/New_York', '405': 'America/Chicago', '406': 'America/Denver',
  '407': 'America/New_York', '408': 'America/Los_Angeles', '409': 'America/Chicago',
  '410': 'America/New_York', '412': 'America/New_York', '413': 'America/New_York',
  '414': 'America/Chicago', '415': 'America/Los_Angeles', '416': 'America/Toronto',
  '417': 'America/Chicago', '418': 'America/Toronto', '419': 'America/New_York',
  '423': 'America/New_York', '424': 'America/Los_Angeles', '425': 'America/Los_Angeles',
  '430': 'America/Chicago', '431': 'America/Winnipeg', '432': 'America/Chicago',
  '434': 'America/New_York', '435': 'America/Denver', '437': 'America/Toronto',
  '438': 'America/Toronto', '440': 'America/New_York', '442': 'America/Los_Angeles',
  '443': 'America/New_York', '445': 'America/New_York', '447': 'America/Chicago',
  '448': 'America/New_York', '450': 'America/Toronto', '456': 'America/New_York',
  '458': 'America/Los_Angeles', '463': 'America/New_York', '464': 'America/Chicago',
  '469': 'America/Chicago', '470': 'America/New_York', '472': 'America/New_York',
  '473': 'America/New_York', '475': 'America/New_York', '478': 'America/New_York',
  '479': 'America/Chicago', '480': 'America/Phoenix', '484': 'America/New_York',
  '501': 'America/Chicago', '502': 'America/New_York', '503': 'America/Los_Angeles',
  '504': 'America/Chicago', '505': 'America/Denver', '506': 'America/Moncton',
  '507': 'America/Chicago', '508': 'America/New_York', '509': 'America/Los_Angeles',
  '510': 'America/Los_Angeles', '512': 'America/Chicago', '513': 'America/New_York',
  '514': 'America/Toronto', '515': 'America/Chicago', '516': 'America/New_York',
  '517': 'America/New_York', '518': 'America/New_York', '519': 'America/Toronto',
  '520': 'America/Phoenix', '521': 'America/Chicago', '522': 'America/Chicago',
  '523': 'America/Phoenix', '524': 'America/Chicago', '525': 'America/Chicago',
  '526': 'America/New_York', '527': 'America/Chicago', '528': 'America/Phoenix',
  '529': 'America/New_York', '530': 'America/Los_Angeles', '531': 'America/Chicago',
  '534': 'America/Chicago', '535': 'America/Chicago', '536': 'America/New_York',
  '537': 'America/New_York', '538': 'America/Chicago', '539': 'America/Chicago',
  '540': 'America/New_York', '541': 'America/Los_Angeles', '544': 'America/Los_Angeles',
  '545': 'America/New_York', '546': 'America/Chicago', '547': 'America/Chicago',
  '548': 'America/Toronto', '549': 'America/Los_Angeles', '551': 'America/New_York',
  '552': 'America/New_York', '553': 'America/Chicago', '554': 'America/Chicago',
  '555': 'America/New_York', '556': 'America/New_York', '557': 'America/Chicago',
  '558': 'America/Los_Angeles', '559': 'America/Los_Angeles', '560': 'America/New_York',
  '561': 'America/New_York', '562': 'America/Los_Angeles', '563': 'America/Chicago',
  '564': 'America/Los_Angeles', '565': 'America/Chicago', '566': 'America/Chicago',
  '567': 'America/New_York', '568': 'America/New_York', '569': 'America/Los_Angeles',
  '570': 'America/New_York', '571': 'America/New_York', '572': 'America/Chicago',
  '573': 'America/Chicago', '574': 'America/New_York', '575': 'America/Denver',
  '576': 'America/Chicago', '577': 'America/Chicago', '578': 'America/New_York',
  '579': 'America/Toronto', '580': 'America/Chicago', '581': 'America/Toronto',
  '582': 'America/New_York', '584': 'America/New_York', '585': 'America/New_York',
  '586': 'America/New_York', '587': 'America/Edmonton', '588': 'America/Chicago',
  '601': 'America/Chicago', '602': 'America/Phoenix', '603': 'America/New_York',
  '604': 'America/Vancouver', '605': 'America/Chicago', '606': 'America/New_York',
  '607': 'America/New_York', '608': 'America/Chicago', '609': 'America/New_York',
  '610': 'America/New_York', '612': 'America/Chicago', '613': 'America/Toronto',
  '614': 'America/New_York', '615': 'America/Chicago', '616': 'America/New_York',
  '617': 'America/New_York', '618': 'America/Chicago', '619': 'America/Los_Angeles',
  '620': 'America/Chicago', '623': 'America/Phoenix', '624': 'America/Phoenix',
  '625': 'America/Los_Angeles', '626': 'America/Los_Angeles', '627': 'America/Los_Angeles',
  '628': 'America/Los_Angeles', '629': 'America/Chicago', '630': 'America/Chicago',
  '631': 'America/New_York', '632': 'America/New_York', '633': 'America/New_York',
  '634': 'America/New_York', '636': 'America/Chicago', '637': 'America/Chicago',
  '638': 'America/New_York', '639': 'America/Regina', '640': 'America/New_York',
  '641': 'America/Chicago', '642': 'America/New_York', '643': 'America/Los_Angeles',
  '644': 'America/Los_Angeles', '645': 'America/New_York', '646': 'America/New_York',
  '647': 'America/Toronto', '649': 'America/New_York', '650': 'America/Los_Angeles',
  '651': 'America/Chicago', '652': 'America/New_York', '653': 'America/New_York',
  '654': 'America/New_York', '656': 'America/New_York', '657': 'America/Los_Angeles',
  '658': 'America/New_York', '659': 'America/Chicago', '660': 'America/Chicago',
  '661': 'America/Los_Angeles', '662': 'America/Chicago', '663': 'America/New_York',
  '664': 'America/New_York', '665': 'America/Los_Angeles', '667': 'America/New_York',
  '668': 'America/Toronto', '669': 'America/Los_Angeles', '670': 'America/New_York',
  '671': 'America/New_York', '672': 'America/Vancouver', '673': 'America/New_York',
  '674': 'America/New_York', '675': 'America/New_York', '676': 'America/Los_Angeles',
  '677': 'America/New_York', '678': 'America/New_York', '679': 'America/New_York',
  '680': 'America/New_York', '681': 'America/New_York', '682': 'America/Chicago',
  '683': 'America/New_York', '684': 'America/New_York', '686': 'America/Chicago',
  '687': 'America/Chicago', '688': 'America/Chicago', '689': 'America/Los_Angeles',
  '701': 'America/Chicago', '702': 'America/Los_Angeles', '703': 'America/New_York',
  '704': 'America/New_York', '705': 'America/Toronto', '706': 'America/New_York',
  '707': 'America/Los_Angeles', '708': 'America/Chicago', '709': 'America/St_Johns',
  '710': 'America/New_York', '712': 'America/Chicago', '713': 'America/Chicago',
  '714': 'America/Los_Angeles', '715': 'America/Chicago', '716': 'America/New_York',
  '717': 'America/New_York', '718': 'America/New_York', '719': 'America/Denver',
  '720': 'America/Denver', '721': 'America/New_York', '724': 'America/New_York',
  '725': 'America/Los_Angeles', '726': 'America/Los_Angeles', '727': 'America/New_York',
  '728': 'America/New_York', '729': 'America/New_York', '730': 'America/Chicago',
  '731': 'America/Chicago', '732': 'America/New_York', '733': 'America/Chicago',
  '734': 'America/New_York', '735': 'America/Chicago', '736': 'America/Chicago',
  '737': 'America/Chicago', '738': 'America/Chicago', '739': 'America/Chicago',
  '740': 'America/New_York', '743': 'America/New_York', '744': 'America/New_York',
  '745': 'America/New_York', '747': 'America/Los_Angeles', '748': 'America/Los_Angeles',
  '749': 'America/Los_Angeles', '750': 'America/Los_Angeles', '751': 'America/New_York',
  '752': 'America/New_York', '753': 'America/New_York', '754': 'America/New_York',
  '755': 'America/New_York', '756': 'America/Chicago', '757': 'America/New_York',
  '758': 'America/New_York', '759': 'America/New_York', '760': 'America/Los_Angeles',
  '761': 'America/Los_Angeles', '762': 'America/New_York', '763': 'America/Chicago',
  '764': 'America/Los_Angeles', '765': 'America/New_York', '766': 'America/New_York',
  '767': 'America/New_York', '768': 'America/New_York', '769': 'America/Chicago',
  '770': 'America/New_York', '771': 'America/New_York', '772': 'America/New_York',
  '773': 'America/Chicago', '774': 'America/New_York', '775': 'America/Los_Angeles',
  '776': 'America/Chicago', '777': 'America/New_York', '778': 'America/Vancouver',
  '779': 'America/Chicago', '780': 'America/Edmonton', '781': 'America/New_York',
  '782': 'America/Halifax', '783': 'America/New_York', '784': 'America/New_York',
  '785': 'America/Chicago', '786': 'America/New_York', '787': 'America/Puerto_Rico',
  '788': 'America/New_York', '789': 'America/New_York', '790': 'America/Chicago',
  '791': 'America/Chicago', '792': 'America/New_York', '793': 'America/New_York',
  '794': 'America/New_York', '795': 'America/New_York', '796': 'America/New_York',
  '797': 'America/Chicago', '798': 'America/New_York', '799': 'America/New_York',
  '800': 'America/New_York', '801': 'America/Denver', '802': 'America/New_York',
  '803': 'America/New_York', '804': 'America/New_York', '805': 'America/Los_Angeles',
  '806': 'America/Chicago', '807': 'America/Toronto', '808': 'Pacific/Honolulu',
  '809': 'America/New_York', '810': 'America/New_York', '812': 'America/New_York',
  '813': 'America/New_York', '814': 'America/New_York', '815': 'America/Chicago',
  '816': 'America/Chicago', '817': 'America/Chicago', '818': 'America/Los_Angeles',
  '819': 'America/Toronto', '820': 'America/Los_Angeles', '821': 'America/New_York',
  '822': 'America/New_York', '823': 'America/New_York', '824': 'America/New_York',
  '825': 'America/Edmonton', '826': 'America/New_York', '827': 'America/New_York',
  '828': 'America/New_York', '829': 'America/New_York', '830': 'America/Chicago',
  '831': 'America/Los_Angeles', '832': 'America/Chicago', '833': 'America/New_York',
  '834': 'America/New_York', '835': 'America/New_York', '836': 'America/New_York',
  '837': 'America/New_York', '838': 'America/New_York', '839': 'America/New_York',
  '840': 'America/New_York', '843': 'America/New_York', '844': 'America/New_York',
  '845': 'America/New_York', '846': 'America/New_York', '847': 'America/Chicago',
  '848': 'America/New_York', '849': 'America/New_York', '850': 'America/Chicago',
  '851': 'America/New_York', '852': 'America/New_York', '853': 'America/New_York',
  '854': 'America/New_York', '855': 'America/New_York', '856': 'America/New_York',
  '857': 'America/New_York', '858': 'America/Los_Angeles', '859': 'America/New_York',
  '860': 'America/New_York', '861': 'America/New_York', '862': 'America/New_York',
  '863': 'America/New_York', '864': 'America/New_York', '865': 'America/New_York',
  '866': 'America/New_York', '867': 'America/Yellowknife', '868': 'America/New_York',
  '869': 'America/New_York', '870': 'America/Chicago', '871': 'America/New_York',
  '872': 'America/Chicago', '873': 'America/Toronto', '874': 'America/New_York',
  '875': 'America/New_York', '876': 'America/New_York', '877': 'America/New_York',
  '878': 'America/New_York', '879': 'America/New_York', '880': 'America/New_York',
  '881': 'America/New_York', '882': 'America/New_York', '883': 'America/New_York',
  '884': 'America/New_York', '885': 'America/New_York', '886': 'America/New_York',
  '887': 'America/New_York', '888': 'America/New_York', '889': 'America/New_York',
  '901': 'America/Chicago', '902': 'America/Halifax', '903': 'America/Chicago',
  '904': 'America/New_York', '905': 'America/Toronto', '906': 'America/New_York',
  '907': 'America/Anchorage', '908': 'America/New_York', '909': 'America/Los_Angeles',
  '910': 'America/New_York', '912': 'America/New_York', '913': 'America/Chicago',
  '914': 'America/New_York', '915': 'America/Chicago', '916': 'America/Los_Angeles',
  '917': 'America/New_York', '918': 'America/Chicago', '919': 'America/New_York',
  '920': 'America/Chicago', '921': 'America/Los_Angeles', '922': 'America/Los_Angeles',
  '923': 'America/Los_Angeles', '924': 'America/Los_Angeles', '925': 'America/Los_Angeles',
  '926': 'America/New_York', '927': 'America/Los_Angeles', '928': 'America/Phoenix',
  '929': 'America/New_York', '930': 'America/New_York', '931': 'America/Chicago',
  '932': 'America/New_York', '933': 'America/Los_Angeles', '934': 'America/New_York',
  '935': 'America/Los_Angeles', '936': 'America/Chicago', '937': 'America/New_York',
  '938': 'America/Chicago', '939': 'America/Puerto_Rico', '940': 'America/Chicago',
  '941': 'America/New_York', '942': 'America/Chicago', '943': 'America/New_York',
  '944': 'America/Los_Angeles', '945': 'America/Chicago', '946': 'America/Los_Angeles',
  '947': 'America/New_York', '948': 'America/Los_Angeles', '949': 'America/Los_Angeles',
  '950': 'America/New_York', '951': 'America/Los_Angeles', '952': 'America/Chicago',
  '953': 'America/New_York', '954': 'America/New_York', '955': 'America/New_York',
  '956': 'America/Chicago', '957': 'America/New_York', '958': 'America/Los_Angeles',
  '959': 'America/New_York', '960': 'America/New_York', '961': 'America/New_York',
  '962': 'America/New_York', '963': 'America/New_York', '964': 'America/New_York',
  '965': 'America/New_York', '966': 'America/New_York', '967': 'America/New_York',
  '968': 'America/New_York', '969': 'America/New_York', '970': 'America/Denver',
  '971': 'America/Los_Angeles', '972': 'America/Chicago', '973': 'America/New_York',
  '974': 'America/Los_Angeles', '975': 'America/Chicago', '976': 'America/Chicago',
  '977': 'America/New_York', '978': 'America/New_York', '979': 'America/Chicago',
  '980': 'America/New_York', '981': 'America/Los_Angeles', '982': 'America/Chicago',
  '983': 'America/New_York', '984': 'America/New_York', '985': 'America/Chicago',
  '986': 'America/Los_Angeles', '987': 'America/New_York', '988': 'America/New_York',
  '989': 'America/New_York', '990': 'America/New_York', '991': 'America/New_York',
  '992': 'America/New_York', '993': 'America/New_York', '994': 'America/New_York',
  '995': 'America/New_York', '996': 'America/New_York', '997': 'America/New_York',
  '998': 'America/New_York', '999': 'America/New_York',
};

/**
 * Extract area code from phone number
 * @param {string} phoneNumber - Phone number in any format
 * @returns {string|null} 3-digit area code or null
 */
function extractAreaCode(phoneNumber) {
  if (!phoneNumber) return null;
  
  // Remove all non-digits
  const digits = phoneNumber.replace(/\D/g, '');
  
  // US/Canada numbers: +1XXXXXXXXXX or 1XXXXXXXXXX or XXXXXXXXXX
  if (digits.length >= 10) {
    // If starts with 1, skip it (country code)
    const startIndex = digits.startsWith('1') && digits.length === 11 ? 1 : 0;
    // Extract 3-digit area code
    return digits.substring(startIndex, startIndex + 3);
  }
  
  return null;
}

/**
 * Get timezone from phone number area code
 * @param {string} phoneNumber - Phone number in any format
 * @param {string} fallbackTimezone - Fallback timezone if detection fails
 * @returns {string} IANA timezone identifier
 */
export function getTimezoneFromPhoneNumber(phoneNumber, fallbackTimezone = 'America/New_York') {
  const areaCode = extractAreaCode(phoneNumber);
  
  if (!areaCode) {
    console.warn(`[TimezoneDetector] Could not extract area code from ${phoneNumber}, using fallback: ${fallbackTimezone}`);
    return fallbackTimezone;
  }
  
  const timezone = AREA_CODE_TO_TIMEZONE[areaCode];
  
  if (!timezone) {
    console.warn(`[TimezoneDetector] Unknown area code ${areaCode} for ${phoneNumber}, using fallback: ${fallbackTimezone}`);
    return fallbackTimezone;
  }
  
  return timezone;
}

/**
 * Check if current time is within quiet hours for a given timezone
 * @param {string} timezone - IANA timezone identifier
 * @param {number} startHour - Start hour (0-23), default 9 (9 AM)
 * @param {number} endHour - End hour (0-23), default 20 (8 PM)
 * @returns {Object} { isWithinQuietHours: boolean, currentTime: Date, message: string }
 */
export function checkQuietHours(timezone, startHour = 9, endHour = 20) {
  const now = new Date();
  
  // Get current time in the specified timezone
  const timeInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentHour = timeInTimezone.getHours();
  const currentMinute = timeInTimezone.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  const startTimeMinutes = startHour * 60;
  const endTimeMinutes = endHour * 60;
  
  // Check if within allowed window (9 AM - 8 PM)
  const isWithinWindow = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
  
  const status = isWithinWindow ? 'allowed' : 'quiet_hours';
  const message = isWithinWindow
    ? `Current time in ${timezone}: ${timeInTimezone.toLocaleTimeString()} - Within allowed hours (${startHour}:00 - ${endHour}:00)`
    : `Current time in ${timezone}: ${timeInTimezone.toLocaleTimeString()} - QUIET HOURS (allowed: ${startHour}:00 - ${endHour}:00)`;
  
  return {
    isWithinQuietHours: !isWithinWindow,
    isWithinAllowedHours: isWithinWindow,
    currentTime: timeInTimezone,
    currentHour,
    currentMinute,
    timezone,
    status,
    message,
  };
}


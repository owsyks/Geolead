import axios from 'axios';

interface WhoisContact {
  email: string;
  name?: string;
  organization?: string;
}

/**
 * Lookup domain registrant contact info via WHOIS API.
 * Supports multiple providers (WhoisXML, WhoisFreaks) configured via env vars.
 * Returns an array of email addresses found in the registrant/tech/admin contacts.
 *
 * Supported env vars:
 *   WHOISXML_API_KEY   — WhoisXML API key (https://www.whoisxmlapi.com)
 *   WHOISFREAKS_KEY    — WhoisFreaks API key (https://www.whoisfreaks.com)
 *
 * Returns empty array when no API is configured or the lookup fails.
 */
export async function lookupDomainOwner(domain: string): Promise<WhoisContact[]> {
  const contacts: WhoisContact[] = [];

  const whoisxmlKey = process.env.WHOISXML_API_KEY;
  const whoisfreaksKey = process.env.WHOISFREAKS_KEY;

  if (whoisxmlKey) {
    try {
      const res = await axios.get('https://www.whoisxmlapi.com/whoisserver/WhoisService', {
        params: {
          apiKey: whoisxmlKey,
          domainName: domain,
          outputFormat: 'JSON',
          da: 2, // Include raw whois data
        },
        timeout: 10000,
      });

      const data = res.data?.WhoisRecord || res.data;
      const registrantEmail = data?.registrant?.email || data?.administrativeContact?.email || data?.technicalContact?.email;
      const registrantName = data?.registrant?.name || data?.registrant?.organization;
      const org = data?.registrant?.organization;

      if (registrantEmail && isValidEmail(registrantEmail)) {
        contacts.push({ email: registrantEmail, name: registrantName, organization: org });
      }

      // Also check raw text for emails
      const rawText = typeof data?.rawText === 'string' ? data.rawText : '';
      if (rawText) {
        const emails = extractEmails(rawText);
        const existing = new Set(contacts.map(c => c.email.toLowerCase()));
        for (const email of emails) {
          if (!existing.has(email.toLowerCase())) {
            contacts.push({ email, organization: org });
            existing.add(email.toLowerCase());
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ReverseWhois] WhoisXML lookup failed for ${domain}: ${err.message}`);
    }
  }

  if (whoisfreaksKey && contacts.length === 0) {
    try {
      const res = await axios.get('https://api.whoisfreaks.com/v1.0/whois', {
        params: {
          apiKey: whoisfreaksKey,
          whois: domain,
          mode: 'purchase',
        },
        timeout: 10000,
      });

      const data = res.data;
      const registrant = data?.whois_record?.registrant || {};
      const admin = data?.whois_record?.administrative_contact || {};
      const tech = data?.whois_record?.technical_contact || {};

      for (const contact of [registrant, admin, tech]) {
        if (contact.email && isValidEmail(contact.email)) {
          const existing = contacts.some(c => c.email.toLowerCase() === contact.email.toLowerCase());
          if (!existing) {
            contacts.push({ email: contact.email, name: contact.name, organization: contact.organization });
          }
        }
      }
    } catch (err: any) {
      console.warn(`[ReverseWhois] WhoisFreaks lookup failed for ${domain}: ${err.message}`);
    }
  }

  if (contacts.length > 0) {
    console.log(`[ReverseWhois] Found ${contacts.length} registrant contacts for ${domain}`);
  }

  return contacts;
}

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/.test(email.trim());
}

function extractEmails(text: string): string[] {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
  const matches = text.match(regex);
  if (!matches) return [];
  return [...new Set(matches.map(e => e.toLowerCase()))].filter(e => {
    return !e.includes('example.') && !e.endsWith('.test') && !e.endsWith('.invalid');
  });
}

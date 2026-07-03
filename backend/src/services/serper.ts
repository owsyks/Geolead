import axios from 'axios';
import { getSetting } from './settings.js';

export interface SerperResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

export interface SerperPlace {
  title: string;
  address: string;
  phoneNumber?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  category?: string;
  website?: string;
  cid?: string;
}

interface SerperSearchOptions {
  page?: number;
  num?: number;
  userId?: string | null; // resolve the calling user's Serper key
}

/**
 * Searches Google using Serper.dev API. Falls back to mock data if key is missing.
 */
export async function searchGoogle(query: string, options: SerperSearchOptions = {}): Promise<SerperResult[]> {
  const apiKey = await getSetting('serperApiKey', options.userId);

  if (!apiKey) {
    console.log(`[Serper.dev] API key missing. Generating mock search results for: "${query}"`);
    return getMockSearchResults(query);
  }

  try {
    const body = {
      q: query,
      ...(options.page ? { page: options.page } : {}),
      ...(options.num ? { num: options.num } : {}),
    };

    const response = await axios.post(
      'https://google.serper.dev/search',
      body,
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const organic = response.data.organic || [];
    return organic.map((item: any) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      position: item.position,
    }));
  } catch (error: any) {
    console.error(`[Serper.dev] Search error: ${error.message}. Falling back to mock data.`);
    return getMockSearchResults(query);
  }
}

/**
 * Searches Google Maps via Serper.dev Places. Falls back to mock data if key is missing.
 */
export async function searchGooglePlaces(query: string, options: SerperSearchOptions = {}): Promise<SerperPlace[]> {
  const apiKey = await getSetting('serperApiKey', options.userId);

  if (!apiKey) {
    console.log(`[Serper.dev] API key missing. Generating mock places results for: "${query}"`);
    return getMockPlacesResults(query);
  }

  try {
    const body = {
      q: query,
      ...(options.page ? { page: options.page } : {}),
      ...(options.num ? { num: options.num } : {}),
    };

    const response = await axios.post(
      'https://google.serper.dev/places',
      body,
      {
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const places = response.data.places || [];
    return places.map((item: any) => ({
      title: item.title,
      address: item.address,
      phoneNumber: item.phoneNumber,
      latitude: item.latitude,
      longitude: item.longitude,
      rating: item.rating,
      ratingCount: item.ratingCount,
      category: item.category,
      website: item.website,
      cid: item.cid,
    }));
  } catch (error: any) {
    console.error(`[Serper.dev] Places error: ${error.message}. Falling back to mock data.`);
    return getMockPlacesResults(query);
  }
}

// ==========================================
// Mock Data Generators for Testing / Fallback
// ==========================================

function getMockSearchResults(query: string): SerperResult[] {
  const queryLower = query.toLowerCase();

  // Extract location if present
  let location = 'Texas';
  if (queryLower.includes('texas')) location = 'Texas';
  else if (queryLower.includes('miami')) location = 'Miami';
  else if (queryLower.includes('london')) location = 'London';
  else if (queryLower.includes('dubai')) location = 'Dubai';

  // Extract niche
  let niche = 'Car Vendor';
  let domainWord = 'car';
  if (queryLower.includes('dental') || queryLower.includes('dentist')) {
    niche = 'Dental Clinic';
    domainWord = 'dental';
  } else if (queryLower.includes('roof')) {
    niche = 'Roofing Services';
    domainWord = 'roof';
  } else if (queryLower.includes('estate') || queryLower.includes('real')) {
    niche = 'Real Estate';
    domainWord = 'property';
  }

  return [
    {
      title: `${location} Premium ${niche} - Trusted Local Experts`,
      link: `https://www.example-${location.toLowerCase()}-${domainWord}.com`,
      snippet: `We are the premier ${niche} in ${location}. Offering top-rated services, expert consultation, and 24/7 client support. Contact us today for a free quote!`,
      position: 1
    },
    {
      title: `Apex ${niche} of ${location}`,
      link: `https://www.apex${domainWord}${location.toLowerCase()}.com`,
      snippet: `Visit Apex ${niche} for the best deals and experienced professionals in the ${location} region. Highly rated with thousands of satisfied clients.`,
      position: 2
    },
    {
      title: `${location} Associated ${niche} Group`,
      link: `https://www.example.org`, // A general or non-matching domain to test relevance scoring
      snippet: `Looking for a certified ${niche}? Our network covers all of ${location} and nearby areas. Phone: (555) 123-4567. Email: info@associatedniche.org`,
      position: 3
    },
    {
      title: `Top 10 ${niche} in ${location} - Yelp & Directory`,
      link: `https://www.yelp.com/search?find_desc=${encodeURIComponent(niche)}&find_loc=${encodeURIComponent(location)}`,
      snippet: `Find the best reviews and ratings for top-rated ${niche} companies in ${location}. Compare prices, services, and read customer testimonials.`,
      position: 4
    }
  ];
}

function getMockPlacesResults(query: string): SerperPlace[] {
  const queryLower = query.toLowerCase();
  let location = 'Texas';
  if (queryLower.includes('texas')) location = 'Texas';
  else if (queryLower.includes('miami')) location = 'Miami';
  else if (queryLower.includes('london')) location = 'London';
  else if (queryLower.includes('dubai')) location = 'Dubai';

  let niche = 'Car Dealer';
  let domainWord = 'car';
  let category = 'Car Dealership';
  if (queryLower.includes('dental') || queryLower.includes('dentist')) {
    niche = 'Dentist Clinic';
    domainWord = 'dental';
    category = 'Dental Clinic';
  } else if (queryLower.includes('roof')) {
    niche = 'Roofing Contractors';
    domainWord = 'roof';
    category = 'Roofing Contractor';
  } else if (queryLower.includes('estate') || queryLower.includes('real')) {
    niche = 'Real Estate Agency';
    domainWord = 'realestate';
    category = 'Real Estate Agency';
  }

  return [
    {
      title: `${location} Auto & ${niche}`,
      address: `100 Main St, ${location}, USA`,
      rating: 4.8,
      ratingCount: 124,
      category,
      website: `https://www.example-${location.toLowerCase()}-${domainWord}.com`,
      cid: '12345678901'
    },
    {
      title: `Apex ${niche} Group`,
      address: `456 Commerce Ave, ${location}, USA`,
      rating: 4.5,
      ratingCount: 89,
      category,
      website: `https://www.apex${domainWord}${location.toLowerCase()}.com`,
      cid: '12345678902'
    },
    {
      title: `Downtown ${niche} Associates`,
      address: `789 Broadway Blvd, ${location}, USA`,
      rating: 4.2,
      ratingCount: 45,
      category,
      website: `https://www.example.org`,
      cid: '12345678903'
    }
  ];
}

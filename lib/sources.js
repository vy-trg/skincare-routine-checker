// The name to show for a source link: the publisher when we know the site, otherwise the host name.
// Pure. Used by the API (accordion) and the routine page (warning cards), so both say the same thing.
const PUBLISHERS = {
  'aad.org': 'American Academy of Dermatology',
  'dermnetnz.org': 'DermNet',
  'pmc.ncbi.nlm.nih.gov': 'PubMed Central',
};

// "https://www.aad.org/x" -> "American Academy of Dermatology"; unknown host -> "example.org";
// anything that is not an http(s) URL -> null (the caller then shows no source name).
function sourceName(url) {
  let host;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
  if (host === '') return null;
  // An exact site or a subdomain of it ("www" was removed above). Never a look-alike such as "notaad.org".
  for (const [site, name] of Object.entries(PUBLISHERS)) {
    if (host === site || host.endsWith(`.${site}`)) return name;
  }
  return host;
}

module.exports = { PUBLISHERS, sourceName };

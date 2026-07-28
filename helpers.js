/**
 * Formats a name by returning "Last, First" format.
 * 
 * @param {string} first - The first name to format (must be non-empty string)
 * @param {string} last - The last name to format (must be non-empty string)
 * @returns {string} Formatted name in "Last, First" format
 * @throws Will throw an error if either parameter is empty or not a string
 */
function formatName(first, last) {
  // Validate parameters
  if (!first || typeof first !== 'string') {
    throw new Error('First name must be non-empty string');
  }
  
  if (!last || typeof last !== 'string') {
    throw new Error('Last name must be non-empty string');
  }

  return `${last.trim()}, ${first.trim()}`;
}

module.exports = { formatName };
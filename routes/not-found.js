// The same 404 page the app shows for unknown URLs. Used when an id in a URL or form is bad,
// missing, or belongs to another user: all three look identical on purpose.
function notFound(res) {
  res.status(404).render('error', {
    title: 'Not Found',
    heading: 'Page Not Found',
    message: 'That page does not exist.',
  });
}

module.exports = notFound;

// Show the "Describe your skin type" field only when "Other" is selected.
(function () {
  var select = document.getElementById('skin_type');
  var field = document.getElementById('skin-type-other-field');
  if (!select || !field) return;

  function sync() {
    field.hidden = select.value !== 'other';
  }

  select.addEventListener('change', sync);
  sync();
})();

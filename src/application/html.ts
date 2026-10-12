// Los datos vienen de otros servicios: se escapan para no inyectar HTML en el correo.
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

// Plantilla común de los correos: saludo, introducción, lista de datos y cierre.
export const emailLayout = (
  name: string | undefined,
  intro: string,
  fields: Array<[string, string | undefined]>,
  closing: string,
) => {
  const items = fields
    .filter(([, value]) => value)
    .map(([label, value]) => `<li><b>${label}:</b> ${escapeHtml(value!)}</li>`)
    .join('');

  return `
<div style="font-family: Arial, sans-serif; color: #222;">
  <h2>Hola${name ? `, ${escapeHtml(name)}` : ''}</h2>
  <p>${intro}</p>
  <ul>${items}</ul>
  <p>${closing}</p>
</div>`.trim();
};

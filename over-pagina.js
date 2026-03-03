const infoPages = [
  {
    id: "over-producthulp",
    title: "Over producthulp.nl",
    file: "over-producthulp.html",
    html: `
      <p class="info-lead">
        producthulp.nl helpt consumenten het juiste product te vinden — zonder reclame, zonder verborgen agenda. Wij zijn een onafhankelijk platform dat eerlijk en gratis advies biedt via slimme keuzehulpen.
      </p>

      <h2>Onze missie</h2>
      <p>
        De markt zit vol met keuzemogelijkheden. Of het nu gaat om een televisie, een laptop of een wasmachine — het aanbod is overweldigend en productspecificaties zijn vaak moeilijk te vergelijken. producthulp.nl bestaat om dat eenvoudiger te maken. Wij stellen je de juiste vragen, zodat jij het product krijgt dat écht bij je past.
      </p>

      <div class="info-highlight">
        Wij ontvangen geen betaling van fabrikanten of winkeliers om bepaalde producten aan te bevelen. Onze aanbevelingen zijn altijd gebaseerd op de antwoorden die jij geeft.
      </div>

      <h2>Wat bieden wij?</h2>
      <div class="info-card">
        <ul>
          <li><strong>Keuzehulpen</strong> — interactieve vragenlijsten die jouw wensen vertalen naar een persoonlijk productadvies.</li>
          <li><strong>Productinformatie</strong> — heldere uitleg over specificaties en wat ze betekenen in de praktijk.</li>
          <li><strong>Vergelijkingen</strong> — een overzicht van aanbevolen producten gefilterd op jouw voorkeuren en budget.</li>
        </ul>
      </div>

      <h2>Binnenkort beschikbaar</h2>
      <p>
        Momenteel is de televisie-keuzehulp live. We werken actief aan keuzehulpen voor soundbars, laptops, koffiemachines en wasmachines. Houd de website in de gaten voor updates.
      </p>
    `,
  },
  {
    id: "hoe-werkt-het",
    title: "Hoe werkt het?",
    file: "hoe-werkt-het.html",
    html: `
      <p class="info-lead">
        In een paar minuten weet jij welke televisie het beste bij jou past. Hier leggen we stap voor stap uit hoe onze keuzehulp werkt.
      </p>

      <ol class="info-steps">
        <li class="info-step">
          <div class="info-step-number">1</div>
          <div class="info-step-body">
            <span class="info-step-title">Beantwoord een paar vragen</span>
            <span class="info-step-desc">We stellen je gerichte vragen over je gebruik, wensen en budget. Denk aan: hoe groot is de kamer? Kijk je veel op Netflix? Heb je een spelconsole? Er zijn geen goede of foute antwoorden.</span>
          </div>
        </li>
        <li class="info-step">
          <div class="info-step-number">2</div>
          <div class="info-step-body">
            <span class="info-step-title">Ons systeem matcht jouw profiel</span>
            <span class="info-step-desc">Op basis van jouw antwoorden berekent ons matchingssysteem welke producten het beste aansluiten bij jouw situatie. Elk product krijgt een score op basis van hoe goed het past bij jouw wensen.</span>
          </div>
        </li>
        <li class="info-step">
          <div class="info-step-number">3</div>
          <div class="info-step-body">
            <span class="info-step-title">Ontvang jouw persoonlijk advies</span>
            <span class="info-step-desc">Je ziet een gesorteerde lijst van aanbevolen producten met uitleg waarom elk product goed past. Je kunt de resultaten verder filteren en verfijnen naar behoefte.</span>
          </div>
        </li>
        <li class="info-step">
          <div class="info-step-number">4</div>
          <div class="info-step-body">
            <span class="info-step-title">Kies en koop waar jij dat wil</span>
            <span class="info-step-desc">Wij sturen je door naar bekende webshops waar je het product kunt bekijken en bestellen. Jij bepaalt zelf waar je koopt — wij verdienen niets aan jouw keuze.</span>
          </div>
        </li>
      </ol>

      <div class="info-highlight">
        De hele keuzehulp is gratis en anoniem. We slaan geen persoonlijke gegevens op en je hoeft nergens een account voor aan te maken.
      </div>
    `,
  },
  {
    id: "contact",
    title: "Contact",
    file: "contact.html",
    html: `
      <p class="info-lead">
        Heb je een vraag, opmerking of wil je een fout melden? We horen graag van je.
      </p>

      <div class="info-card">
        <p class="info-card-title">E-mail</p>
        <p>Stuur je bericht naar <a href="mailto:info@producthulp.nl">info@producthulp.nl</a>. We streven ernaar binnen 2 werkdagen te reageren.</p>
      </div>

      <h2>Waarvoor kun je ons bereiken?</h2>
      <div class="info-card">
        <ul>
          <li>Vragen over een productaanbeveling of keuzehulp</li>
          <li>Technische problemen of fouten op de website</li>
          <li>Verzoeken rondom je privacy of gegevens</li>
          <li>Suggesties voor nieuwe keuzehulpen of verbeteringen</li>
          <li>Samenwerkingsverzoeken of persberichten</li>
        </ul>
      </div>

      <p>
        producthulp.nl is een klein team. We doen ons best om alle berichten serieus te nemen en zo snel mogelijk te beantwoorden. Bedankt voor je geduld.
      </p>
    `,
  },
  {
    id: "disclaimer",
    title: "Disclaimer",
    file: "disclaimer.html",
    html: `
      <p class="info-lead">
        Lees deze disclaimer zorgvuldig door voordat je gebruik maakt van producthulp.nl.
      </p>

      <h2>Geen garanties</h2>
      <p>
        producthulp.nl streeft ernaar om actuele en correcte productinformatie aan te bieden. Ondanks onze inspanningen kunnen specificaties, prijzen en beschikbaarheid afwijken van de werkelijkheid. Aan de informatie op deze website kunnen geen rechten worden ontleend.
      </p>

      <h2>Productaanbevelingen</h2>
      <p>
        De aanbevelingen die je ontvangt via onze keuzehulp zijn gebaseerd op de antwoorden die jij invult en op de productdata in onze database. Wij geven geen garantie dat een aanbevolen product voldoet aan al jouw verwachtingen. Wij raden aan om voor de aankoop de productpagina van de betreffende winkel te raadplegen.
      </p>

      <h2>Prijzen</h2>
      <div class="info-highlight">
        Prijzen op producthulp.nl zijn indicatief en kunnen op elk moment wijzigen. De actuele prijs wordt altijd bepaald door de webshop waarbij je het product koopt.
      </div>

      <h2>Externe links</h2>
      <p>
        Deze website bevat links naar externe websites. producthulp.nl is niet verantwoordelijk voor de inhoud of het beleid van deze externe websites. Het klikken op een link naar een externe winkel houdt geen aanbeveling van die winkel in.
      </p>

      <h2>Aansprakelijkheid</h2>
      <p>
        producthulp.nl is niet aansprakelijk voor schade die voortvloeit uit het gebruik van de website of het vertrouwen op de verstrekte informatie. Gebruik van deze website is volledig op eigen risico.
      </p>

      <p>
        Deze disclaimer kan zonder voorafgaande kennisgeving worden gewijzigd. Controleer deze pagina regelmatig voor de meest actuele versie.
      </p>
    `,
  },
  {
    id: "privacy",
    title: "Privacybeleid",
    file: "privacy.html",
    html: `
      <p class="info-lead">
        producthulp.nl respecteert jouw privacy. Op deze pagina leggen we uit welke gegevens we verzamelen, waarom, en hoe we daarmee omgaan.
      </p>

      <h2>Welke gegevens verzamelen wij?</h2>
      <div class="info-card">
        <ul>
          <li><strong>Geen persoonsgegevens</strong> — je hoeft geen naam, e-mailadres of account aan te maken om gebruik te maken van de keuzehulp.</li>
          <li><strong>Anonieme gebruiksdata</strong> — we kunnen anonieme statistieken bijhouden (zoals welke vragen populair zijn) om de keuzehulp te verbeteren. Deze data is niet herleidbaar naar een individu.</li>
          <li><strong>Contactformulier</strong> — als je contact met ons opneemt via e-mail, bewaren we je bericht en e-mailadres alleen om je vraag te beantwoorden.</li>
        </ul>
      </div>

      <h2>Cookies</h2>
      <p>
        producthulp.nl gebruikt geen tracking cookies of advertentiecookies van derden. We gebruiken uitsluitend functionele cookies die noodzakelijk zijn voor een goede werking van de website, zoals het onthouden van jouw antwoorden tijdens de keuzehulp.
      </p>

      <h2>Delen met derden</h2>
      <p>
        Wij verkopen of delen jouw gegevens niet met derden voor commerciële doeleinden. Gegevens worden uitsluitend gedeeld als dit wettelijk verplicht is.
      </p>

      <h2>Beveiliging</h2>
      <p>
        We nemen passende technische en organisatorische maatregelen om jouw gegevens te beschermen tegen verlies, misbruik of ongeoorloofde toegang.
      </p>

      <h2>Jouw rechten</h2>
      <p>
        Je hebt het recht op inzage, correctie en verwijdering van eventuele persoonlijke gegevens die wij van jou bewaren. Stuur hiervoor een e-mail naar <a href="mailto:privacy@producthulp.nl">privacy@producthulp.nl</a>.
      </p>

      <h2>Wijzigingen</h2>
      <p>
        Dit privacybeleid kan worden aangepast. De meest actuele versie is altijd beschikbaar op deze pagina. Laatste update: maart 2026.
      </p>

      <div class="info-highlight">
        Vragen over ons privacybeleid? Neem contact op via <a href="mailto:privacy@producthulp.nl">privacy@producthulp.nl</a>.
      </div>
    `,
  },
];

const pageId = document.body?.dataset?.page;
const current = infoPages.find((page) => page.id === pageId) || infoPages[0];

const titleEl = document.querySelector(".info-title");
const textEl = document.querySelector(".info-text");
const navList = document.querySelector(".info-nav-list");

if (titleEl) {
  titleEl.textContent = current.title;
}

if (textEl) {
  textEl.innerHTML = current.html || "";
}

if (navList) {
  navList.innerHTML = "";
  infoPages.forEach((page) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    const icon = document.createElement("i");

    link.href = page.file;
    link.className = "info-nav-link";
    link.textContent = page.title;

    if (page.id === current.id) {
      link.classList.add("is-active");
    }

    icon.setAttribute("data-lucide", "chevron-right");
    icon.className = "chevron-icon";

    link.appendChild(icon);
    li.appendChild(link);
    navList.appendChild(li);
  });
}

if (window.lucide && typeof window.lucide.createIcons === "function") {
  window.lucide.createIcons();
}

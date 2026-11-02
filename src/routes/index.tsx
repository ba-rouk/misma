import { MismaIcon } from "../components/misma-icon";
import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/")({ component: Index });

const features = [
  { n: "01", title: "One AI for every channel", body: "Connect the conversations your business already has and let one trained agent keep context across them." },
  { n: "02", title: "Teach it your business", body: "Add FAQs, products, services, policies and documents. Update the answers without rebuilding your agent." },
  { n: "03", title: "Human takeover in one tap", body: "When a conversation needs you, step in instantly. Your team stays in control while AI handles the routine work." },
  { n: "04", title: "Turn conversations into sales", body: "Track qualified leads, purchase intent and orders so your team knows when AI has moved a customer forward." },
];

function Index() {
  return (
    <main className="misma-site">
      <nav className="nav">
        <a href="/" className="brand">
          <MismaIcon size={26} className="brand-mark-svg" />
          <span>Misma</span>
        </a>
        <div className="nav-links"><a href="#home">Home</a><a href="#product">Product</a><a href="#about">About</a><a href="#how">How it works</a><a href="#features">Features</a><a href="#contact">Contact</a></div>
        <div className="nav-actions">
          <a href="/login" className="nav-login">Log in</a>
          <a href="/login" className="nav-cta">Get started</a>
        </div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow">BUSINESS AI, CONNECTED</p>
          <h1>One AI. Every customer conversation.</h1>
          <p className="hero-sub">Misma connects your business channels to an AI agent trained on your business.</p>
          <div className="actions"><a className="primary" href="#contact">Get started</a><a className="secondary" href="#how">See how it works</a></div>
        </div>
        <div className="hero-visual" aria-label="Misma solar system of connected business tools">
          <div className="solar-system">
            <div className="solar-orbit orbit-one"><span className="planet planet-website">Website</span><span className="planet planet-orders">Orders</span></div>
            <div className="solar-orbit orbit-two"><span className="planet planet-whatsapp">WhatsApp</span><span className="planet planet-customers">Customers</span></div>
            <div className="solar-orbit orbit-three"><span className="planet planet-email">Email</span><span className="planet planet-social">Social</span></div>
            <div className="sun"><span>AI</span><small>Misma</small></div>
          </div>
        </div>
      </section>

      <section className="statement" id="about">
        <p>Businesses should not have to choose between automation and a human touch.</p>
        <strong>Misma brings both into the same conversation.</strong>
      </section>

      <section className="flow" id="how">
        <div className="flow-intro"><p className="eyebrow">THE FLOW</p><h2>From message to meaningful action.</h2></div>
        <div className="flow-track">
          {["Customer reaches you", "Misma understands", "AI responds", "You take over when needed"].map((x, i) =>
            <div className="flow-step" key={x}><span>{String(i + 1).padStart(2, "0")}</span><h3>{x}</h3><p>{["Across the channels your customers already use.", "It uses your business knowledge and conversation context.", "Fast, consistent answers that sound like your business.", "Your team can step in instantly and continue naturally."][i]}</p></div>
          )}
        </div>
      </section>

      <section className="features" id="features">
        {features.map((f) => <article className="feature" key={f.n}><span>{f.n}</span><div><h3>{f.title}</h3><p>{f.body}</p></div></article>)}
      </section>

      <section className="knowledge">
        <div><p className="eyebrow">YOUR BUSINESS KNOWLEDGE</p><h2>AI that learns what makes your business yours.</h2><p>Give Misma the information your team uses every day. Keep it current as your business changes.</p></div>
        <div className="knowledge-card"><div className="doc"><span>FAQ</span><b>Delivery &amp; returns</b><p>Questions your customers ask most often.</p></div><div className="doc"><span>PRODUCTS</span><b>Your catalog</b><p>Services, prices and product details.</p></div><div className="doc"><span>POLICY</span><b>Business rules</b><p>Instructions for consistent answers.</p></div></div>
      </section>

      <section className="cta" id="contact"><div><p className="eyebrow">READY WHEN YOU ARE</p><h2>Put your customer conversations to work.</h2></div><a className="primary big" href="mailto:hello@misma.ai">Start with Misma</a></section>

      <footer><div className="brand"><MismaIcon size={24} className="brand-mark-svg" /><span>Misma</span></div><span>Business AI, connected.</span></footer>
    </main>
  );
}

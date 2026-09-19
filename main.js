/**
 * DIEFUTURE APARTMENTS — JAVASCRIPT CONTROLLER
 * Handles package linking, brief submission, WhatsApp dispatch, and current year.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Set current year
  const yearSpan = document.getElementById('yearSpan');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  // Set default move-in date
  const userMoveIn = document.getElementById('userMoveIn');
  if (userMoveIn) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    userMoveIn.value = defaultDate.toISOString().split('T')[0];
    userMoveIn.min = new Date().toISOString().split('T')[0];
  }

  // Package select button handlers
  const pkgButtons = document.querySelectorAll('.pkg-btn');
  pkgButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const pkgKey = btn.dataset.pkg;
      const targetRadio = document.querySelector(`input[name="pkg"][value="${pkgKey}"]`);
      if (targetRadio) {
        targetRadio.checked = true;
      }
    });
  });

  // Mobile Navigation Drawer Toggle
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const mobileDrawer = document.getElementById('mobileDrawer');
  
  if (mobileNavToggle && mobileDrawer) {
    mobileNavToggle.addEventListener('click', () => {
      const isOpen = mobileDrawer.classList.toggle('open');
      mobileNavToggle.classList.toggle('active', isOpen);
      mobileNavToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      mobileDrawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    });

    // Close on link click
    mobileDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        mobileNavToggle.classList.remove('active');
        mobileNavToggle.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!mobileDrawer.contains(e.target) && !mobileNavToggle.contains(e.target)) {
        mobileDrawer.classList.remove('open');
        mobileNavToggle.classList.remove('active');
        mobileNavToggle.setAttribute('aria-expanded', 'false');
        mobileDrawer.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Handle Form Submission
  const contactForm = document.getElementById('contact-form');
  const cfOk = document.getElementById('cf-ok');
  const okRef = document.getElementById('okRef');
  const okWaBtn = document.getElementById('okWaBtn');

  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('userName').value.trim();
      const email = document.getElementById('userEmail').value.trim();
      const phone = document.getElementById('userPhone').value.trim();
      const city = document.getElementById('userCity').value;
      const moveIn = document.getElementById('userMoveIn').value;
      const budget = document.getElementById('userBudget').value;
      const roomType = document.querySelector('input[name="room_type"]:checked')?.value || 'WG Room';
      const pkg = document.querySelector('input[name="pkg"]:checked')?.value || 'guaranteed';
      const notes = document.getElementById('userNotes')?.value.trim() || '';

      const pkgTitles = {
        starter: '€99 Room Search Starter',
        guaranteed: '€199 Guaranteed Hunter (100% Refund)',
        vip: '€299 24*7 Response VIP'
      };

      const refCode = 'DF-' + Math.floor(1000 + Math.random() * 9000);
      okRef.textContent = refCode;

      // WhatsApp direct link
      const text = encodeURIComponent(
        `Hello DieFuture Team,\n\nI just submitted my room search brief:\n- Reference: ${refCode}\n- Name: ${name}\n- City: ${city}, Germany\n- Target Move-in: ${moveIn}\n- Type: ${roomType}\n- Budget: ${budget}\n- Package: ${pkgTitles[pkg] || pkg}\n${notes ? '- Notes: ' + notes : ''}\n\nPlease confirm receipt and let me know next steps!`
      );
      okWaBtn.href = `https://wa.me/4915123456789?text=${text}`;

      cfOk.hidden = false;
      cfOk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
});

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
  const submitBtn = document.getElementById('submitBtn');

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('userName').value.trim();
      const email = document.getElementById('userEmail').value.trim();
      const phone = document.getElementById('userPhone').value.trim();
      const city = document.getElementById('userCity').value;
      const moveIn = document.getElementById('userMoveIn').value;
      const budget = document.getElementById('userBudget').value;
      const status = document.getElementById('userStatus')?.value || 'International Student';
      const german = document.querySelector('select[name="german"]')?.value || 'Intermediate (B1–B2)';
      const roomType = document.querySelector('input[name="room_type"]:checked')?.value || 'WG Room';
      const pkg = document.querySelector('input[name="pkg"]:checked')?.value || 'guaranteed';
      const notes = document.getElementById('userNotes')?.value.trim() || '';

      const pkgTitles = {
        starter: '₹8,999 Room Search Starter',
        guaranteed: '₹17,999 Guaranteed Hunter (100% Refund)',
        vip: '₹26,999 24*7 Response VIP',
        lead: 'Direct Verified Lead (Variable Fee)'
      };

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Saving to database...';
      }

      let refCode = 'DF-' + Math.floor(1000 + Math.random() * 9000);

      try {
        const response = await fetch('/api/submit-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            phone,
            city,
            moveIn,
            budget,
            status,
            german,
            roomType,
            pkg,
            notes
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.reference) {
            refCode = data.reference;
          }
        }
      } catch (err) {
        console.warn('API submission failed, falling back to direct WhatsApp dispatch:', err);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Send brief <span>→</span>';
        }
      }

      okRef.textContent = refCode;

      // Price mapping
      const pkgPrices = {
        starter: 8999,
        guaranteed: 17999,
        vip: 26999,
        lead: 12999
      };
      const chosenPrice = pkgPrices[pkg] || 17999;
      const okPkgPrice = document.getElementById('okPkgPrice');
      if (okPkgPrice) {
        okPkgPrice.textContent = '₹' + chosenPrice.toLocaleString('en-IN');
      }

      // Razorpay Checkout Handler
      const payBriefPackageBtn = document.getElementById('payBriefPackageBtn');
      if (payBriefPackageBtn) {
        payBriefPackageBtn.onclick = () => {
          const razorpayKey = "rzp_live_Sv6jDRCvxBn5qA";
          if (typeof Razorpay === 'undefined') {
            alert('Razorpay gateway is initializing, please try again or message our desk on WhatsApp.');
            return;
          }
          const options = {
            key: razorpayKey,
            amount: chosenPrice * 100,
            currency: 'INR',
            name: 'Stayforall Plus Services Pvt Ltd',
            description: `${pkgTitles[pkg] || 'Accommodation Package'} · Ref ${refCode}`,
            image: './assets/diefuture-logo.jpg',
            prefill: {
              name: name,
              email: email,
              contact: phone
            },
            notes: {
              reference: refCode,
              city: city,
              package: pkg
            },
            theme: {
              color: '#0055FF'
            },
            handler: function(response) {
              alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}. Your accommodation search has been activated.`);
              const successText = encodeURIComponent(
                `Hello DieFuture Relocation Desk,\n\nI have successfully paid and activated my package!\n- Reference: ${refCode}\n- Razorpay Payment ID: ${response.razorpay_payment_id}\n- Package: ${pkgTitles[pkg] || pkg}\n- Amount: ₹${chosenPrice.toLocaleString('en-IN')}\n\nPlease confirm activation!`
              );
              window.open(`https://wa.me/919567941647?text=${successText}`, '_blank');
            }
          };
          const rzp = new Razorpay(options);
          rzp.open();
        };
      }

      // WhatsApp direct link
      const text = encodeURIComponent(
        `Hello DieFuture Team,\n\nI just submitted my room search brief:\n- Reference: ${refCode}\n- Name: ${name}\n- City: ${city}, Germany\n- Target Move-in: ${moveIn}\n- Type: ${roomType}\n- Budget: ${budget}\n- Package: ${pkgTitles[pkg] || pkg}\n${notes ? '- Notes: ' + notes : ''}\n\nPlease confirm receipt and let me know next steps!`
      );
      okWaBtn.href = `https://wa.me/919567941647?text=${text}`;

      cfOk.hidden = false;
      cfOk.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
});

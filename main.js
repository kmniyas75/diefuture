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

      function getApiBase() {
        const stored = localStorage.getItem('df_api_endpoint');
        if (stored) return stored.replace(/\/$/, '');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          return 'http://localhost:3001';
        }
        return '';
      }

      // Razorpay Standard Web Checkout Handler
      const payBriefPackageBtn = document.getElementById('payBriefPackageBtn');
      if (payBriefPackageBtn) {
        payBriefPackageBtn.onclick = async () => {
          if (typeof Razorpay === 'undefined') {
            alert('Razorpay gateway is initializing, please check your internet connection or message our desk on WhatsApp.');
            return;
          }

          payBriefPackageBtn.disabled = true;
          const origBtnHtml = payBriefPackageBtn.innerHTML;
          payBriefPackageBtn.innerHTML = '<span>Creating Secure Order...</span>';

          try {
            const apiBase = getApiBase();

            // 1. Backend: Create Order
            const orderRes = await fetch(`${apiBase}/api/create-order`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: chosenPrice * 100, // paise (e.g. ₹17,999 = 1799900 paise)
                currency: 'INR',
                receipt: `rcpt_${refCode}`,
                notes: {
                  reference: refCode,
                  package: pkgTitles[pkg] || pkg,
                  city: city
                }
              })
            });

            if (!orderRes.ok) {
              const errData = await orderRes.json().catch(() => ({}));
              throw new Error(errData.error || `Failed to create order (status: ${orderRes.status})`);
            }

            const orderData = await orderRes.json();
            const razorpayKey = orderData.key_id;

            // 2. Frontend: Open Razorpay Standard Modal
            const options = {
              key: razorpayKey,
              amount: orderData.amount,
              currency: orderData.currency || 'INR',
              name: 'Stayforall Plus Services Pvt Ltd',
              description: `${pkgTitles[pkg] || 'Accommodation Package'} · Ref ${refCode}`,
              image: './assets/diefuture-logo.jpg',
              order_id: orderData.order_id,
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
              // 3. Backend: Verify Signature on Payment Success
              handler: async function(response) {
                payBriefPackageBtn.innerHTML = '<span>Verifying Payment...</span>';

                try {
                  const verifyRes = await fetch(`${apiBase}/api/verify-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      razorpay_order_id: response.razorpay_order_id,
                      razorpay_payment_id: response.razorpay_payment_id,
                      razorpay_signature: response.razorpay_signature
                    })
                  });

                  const verifyData = await verifyRes.json().catch(() => ({}));

                  if (!verifyData.verified) {
                    alert('Payment verification failed: ' + (verifyData.error || 'Invalid signature. Please contact our desk.'));
                    payBriefPackageBtn.disabled = false;
                    payBriefPackageBtn.innerHTML = origBtnHtml;
                    return;
                  }

                  alert(`Payment Verified! Reference: ${refCode}\nPayment ID: ${response.razorpay_payment_id}\nOrder ID: ${response.razorpay_order_id}\n\nYour accommodation package has been activated.`);
                  payBriefPackageBtn.innerHTML = '✓ Payment Confirmed';
                  payBriefPackageBtn.style.background = '#10B981';

                  const successText = encodeURIComponent(
                    `Hello DieFuture Relocation Desk,\n\nI have successfully paid and activated my package!\n- Reference: ${refCode}\n- Razorpay Payment ID: ${response.razorpay_payment_id}\n- Razorpay Order ID: ${response.razorpay_order_id}\n- Package: ${pkgTitles[pkg] || pkg}\n- Amount: ₹${chosenPrice.toLocaleString('en-IN')}\n\nPlease confirm activation!`
                  );
                  window.open(`https://wa.me/919567941647?text=${successText}`, '_blank');
                } catch (verifyErr) {
                  console.error('Verification error:', verifyErr);
                  alert('Payment was received, but verification timed out. Please contact our WhatsApp desk with payment ID: ' + response.razorpay_payment_id);
                  payBriefPackageBtn.disabled = false;
                  payBriefPackageBtn.innerHTML = origBtnHtml;
                }
              },
              modal: {
                ondismiss: function() {
                  console.log('Razorpay modal closed by user.');
                  payBriefPackageBtn.disabled = false;
                  payBriefPackageBtn.innerHTML = origBtnHtml;
                }
              }
            };

            const rzp = new Razorpay(options);
            rzp.on('payment.failed', function(resp) {
              console.error('Razorpay payment failed:', resp.error);
              alert(`Payment failed: ${resp.error.description || resp.error.reason || 'Transaction could not be completed.'}`);
              payBriefPackageBtn.disabled = false;
              payBriefPackageBtn.innerHTML = origBtnHtml;
            });
            rzp.open();
          } catch (err) {
            console.error('Razorpay checkout error:', err);
            alert(`Unable to initialize payment: ${err.message}. Please try again or contact our WhatsApp desk.`);
            payBriefPackageBtn.disabled = false;
            payBriefPackageBtn.innerHTML = origBtnHtml;
          }
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

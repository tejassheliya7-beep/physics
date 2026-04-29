const TOTAL_SLOTS = 50;
const API_URL = 'http://localhost:3000/api/vehicles';

// DOM Elements
const form = document.getElementById('entry-form');
const licenseInput = document.getElementById('license');
const ownerInput = document.getElementById('owner');
const vehicleList = document.getElementById('vehicle-list');
const occupiedSlotsEl = document.getElementById('occupied-slots');
const availableSlotsEl = document.getElementById('available-slots');

const modal = document.getElementById('checkout-modal');
const closeModalBtn = document.getElementById('close-modal');
const checkoutMessage = document.getElementById('checkout-message');
const checkoutFee = document.getElementById('checkout-fee');

// Fetch and display vehicles on load
document.addEventListener('DOMContentLoaded', fetchVehicles);

async function fetchVehicles() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        renderVehicles(data.vehicles);
        updateDashboard(data.vehicles.length);
    } catch (error) {
        console.error('Error fetching vehicles:', error);
    }
}

// Handle Form Submit
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const license_plate = licenseInput.value.trim();
    const owner_name = ownerInput.value.trim();

    if (!license_plate || !owner_name) return;

    try {
        const response = await fetch(`${API_URL}/enter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ license_plate, owner_name })
        });
        
        if (response.ok) {
            // Reset form
            form.reset();
            // Refresh list
            fetchVehicles();
        } else {
            const err = await response.json();
            alert(`Error: ${err.error}`);
        }
    } catch (error) {
        console.error('Error adding vehicle:', error);
    }
});

// Checkout Vehicle
async function checkoutVehicle(id, licensePlate) {
    if (!confirm(`Are you sure you want to checkout vehicle ${licensePlate}?`)) return;

    try {
        const response = await fetch(`${API_URL}/exit/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Show modal
            checkoutMessage.textContent = `Vehicle ${licensePlate} checked out.`;
            checkoutFee.textContent = `$${data.fee}`;
            modal.classList.remove('hidden');
            
            // Refresh list
            fetchVehicles();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error checking out:', error);
    }
}

// Render Table
function renderVehicles(vehicles) {
    vehicleList.innerHTML = ''; // Clear current list

    if (vehicles.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="4" style="text-align: center; color: var(--text-muted);">No vehicles parked</td>`;
        vehicleList.appendChild(tr);
        return;
    }

    vehicles.forEach(v => {
        const entryDate = new Date(v.entry_time);
        const timeString = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = 'row-enter';
        tr.innerHTML = `
            <td><strong>${v.license_plate}</strong></td>
            <td>${v.owner_name}</td>
            <td>${timeString}</td>
            <td>
                <button class="btn-danger" onclick="checkoutVehicle(${v.id}, '${v.license_plate}')">Checkout</button>
            </td>
        `;
        vehicleList.appendChild(tr);
    });
}

// Update Stats
function updateDashboard(occupied) {
    const available = TOTAL_SLOTS - occupied;
    
    // Animate numbers (simple implementation)
    animateValue(occupiedSlotsEl, parseInt(occupiedSlotsEl.textContent), occupied, 500);
    animateValue(availableSlotsEl, parseInt(availableSlotsEl.textContent), available, 500);

    // Color changes based on capacity
    if (available === 0) {
        availableSlotsEl.style.color = 'var(--danger)';
    } else {
        availableSlotsEl.style.color = 'var(--success)';
    }
}

// Simple Number Animation
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Close Modal
closeModalBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});

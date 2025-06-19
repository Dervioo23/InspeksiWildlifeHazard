// URL Google Apps Script untuk operasi GET dan POST
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyXHjj6pQFfLx1l5ftAqeGlpIOmmv_0E5ZcZtj4pyT0CmLTZE026Z0EHvPC22jvrXdDwA/exec';
// ID Spreadsheet Google untuk fitur download Excel
const SPREADSHEET_ID = '13ZuBdQHtqp6nHLFOIjgMcoKvvRKRwFndWE54B1d40kc'; // Ganti dengan ID Spreadsheet Anda

// Mendapatkan referensi ke elemen-elemen DOM
const form = document.getElementById('laporanForm');
const statusMessage = document.getElementById('statusMessage'); // Untuk pesan status form
const stagingStatusMessage = document.getElementById('stagingStatusMessage'); // Untuk pesan status tabel validasi
const searchInput = document.getElementById('searchInput');
const refreshButton = document.getElementById('refreshButton');
const downloadExcelButton = document.getElementById('downloadExcel');
const tabelDataContainer = document.getElementById('tabelData'); // Container untuk tabel global
const stagingTableContainer = document.getElementById('stagingTableContainer'); // Container untuk tabel validasi lokal
const chartContainer = document.getElementById('chartContainer');
const submitButton = form.querySelector('button[type="submit"]'); // Referensi tombol submit form
const namaHewanInput = document.getElementById('namaHewan'); // Referensi input nama hewan
const zonaInput = document.getElementById('zona'); // Referensi input zona
const jumlahInput = document.getElementById('jumlah'); // Referensi input jumlah
const submitStagedDataButton = document.getElementById('submitStagedDataButton'); // Tombol Simpan Semua ke Spreadsheet

// Variabel untuk menyimpan data laporan sementara di sisi klien
let stagedReports = [];
const LOCAL_STORAGE_KEY = 'animalReportsStaging'; // Kunci untuk localStorage

let animalChartInstance; // Variabel untuk menyimpan instance Chart.js

/**
 * Menampilkan pesan status di UI dengan gaya yang sesuai.
 * @param {string} message - Pesan teks yang akan ditampilkan.
 * @param {'info'|'success'|'error'} type - Tipe pesan untuk menentukan styling (info, success, error).
 * @param {HTMLElement} targetElement - Elemen DOM tempat pesan akan ditampilkan.
 */
function showStatusMessage(message, type, targetElement) {
  targetElement.textContent = message;
  targetElement.className = `mt-4 text-center font-medium text-sm min-h-[20px] rounded-lg p-2`;
  if (type === 'info') {
    targetElement.classList.add('text-primary-indigo', 'bg-light-indigo');
  } else if (type === 'success') {
    targetElement.classList.add('text-success-green', 'bg-emerald-100');
  } else if (type === 'error') {
    targetElement.classList.add('text-error-red', 'bg-red-100');
  }
}

/**
 * Menyimpan data stagedReports ke localStorage.
 */
function saveStagedReports() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stagedReports));
}

/**
 * Memuat data stagedReports dari localStorage.
 */
function loadStagedReports() {
  const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (storedData) {
    try {
      stagedReports = JSON.parse(storedData);
      renderStagingTable(); // Render tabel validasi setelah memuat
    } catch (e) {
      console.error('Failed to parse staged reports from localStorage:', e);
      stagedReports = []; // Reset if parsing fails
    }
  }
  // Selalu muat data global dari spreadsheet saat DOMContentLoaded
  loadGlobalSpreadsheetData();
}

/**
 * Menambahkan atau memperbarui laporan ke stagedReports.
 * @param {string} namaHewan - Nama hewan.
 * @param {string} zona - Zona penemuan.
 * @param {number} jumlah - Jumlah hewan.
 */
function addOrUpdateStagedReport(namaHewan, zona, jumlah) {
  // Ubah namaHewan ke format standar (Capitalized) seperti yang dilakukan di doPost
  const formattedNamaHewan = namaHewan.replace(/\b\w/g, (l) => l.toUpperCase());

  // Cari apakah kombinasi hewan dan zona sudah ada di stagedReports
  const existingReportIndex = stagedReports.findIndex((report) => report.namaHewan.toLowerCase().trim() === formattedNamaHewan.toLowerCase().trim() && report.zona.toLowerCase().trim() === zona.toLowerCase().trim());

  const now = new Date();
  const timeZone = 'Asia/Jakarta';
  const day = Utilities.formatDate(now, timeZone, 'EEEE');
  const date = Utilities.formatDate(now, timeZone, 'dd/MM/yyyy');
  const time = Utilities.formatDate(now, timeZone, 'HH:mm');

  if (existingReportIndex > -1) {
    // Jika sudah ada, update jumlahnya
    stagedReports[existingReportIndex].jumlah += jumlah;
    stagedReports[existingReportIndex].hari = day;
    stagedReports[existingReportIndex].tanggal = date;
    stagedReports[existingReportIndex].waktu = time;
  } else {
    // Jika belum ada, tambahkan sebagai laporan baru
    stagedReports.push({
      id: Date.now() + Math.random(), // ID unik untuk identifikasi dan penghapusan
      namaHewan: formattedNamaHewan,
      zona: zona,
      jumlah: jumlah,
      hari: day,
      tanggal: date,
      waktu: time,
    });
  }
  saveStagedReports();
  renderStagingTable();
  showStatusMessage('Laporan ditambahkan ke daftar sementara!', 'success', statusMessage);
  setTimeout(() => {
    statusMessage.textContent = '';
    statusMessage.className = 'mt-4 text-center font-medium text-sm min-h-[20px]';
  }, 3000);
}

/**
 * Menghapus laporan dari stagedReports berdasarkan ID.
 * @param {number} id - ID unik laporan yang akan dihapus.
 */
function deleteStagedReport(id) {
  stagedReports = stagedReports.filter((report) => report.id !== id);
  saveStagedReports();
  renderStagingTable();
  showStatusMessage('Laporan dihapus dari daftar sementara.', 'info', stagingStatusMessage);
  setTimeout(() => {
    stagingStatusMessage.textContent = '';
    stagingStatusMessage.className = 'mt-4 text-center font-medium text-sm min-h-[20px]';
  }, 3000);
}

/**
 * Merender tabel validasi lokal dari stagedReports.
 */
function renderStagingTable() {
  if (stagedReports.length === 0) {
    stagingTableContainer.innerHTML = '<p class="p-8 text-center text-slate-500">Daftar laporan sementara kosong.</p>';
    submitStagedDataButton.disabled = true; // Nonaktifkan tombol simpan jika tidak ada data
    return;
  }

  submitStagedDataButton.disabled = false; // Aktifkan tombol simpan jika ada data

  let tableHTML = '<table class="w-full text-sm text-left text-slate-600">';
  tableHTML += '<thead class="text-xs text-slate-700 uppercase bg-slate-100"><tr>';
  // Headers for staging table (simplified, consistent order)
  const headers = ['Nama Hewan', 'Zona', 'Jumlah', 'Hari', 'Tanggal', 'Waktu', 'Aksi'];
  headers.forEach((header) => {
    tableHTML += `<th scope="col" class="px-4 py-3">${header}</th>`;
  });
  tableHTML += '</tr></thead>';
  tableHTML += '<tbody class="bg-white divide-y divide-slate-200">';

  stagedReports.forEach((report) => {
    tableHTML += `<tr class="hover:bg-slate-50 transition" data-id="${report.id}">`;
    tableHTML += `<td class="px-4 py-3">${report.namaHewan}</td>`;
    tableHTML += `<td class="px-4 py-3">${report.zona}</td>`;
    tableHTML += `<td class="px-4 py-3">${report.jumlah}</td>`;
    tableHTML += `<td class="px-4 py-3">${report.hari}</td>`;
    tableHTML += `<td class="px-4 py-3">${report.tanggal}</td>`;
    tableHTML += `<td class="px-4 py-3">${report.waktu}</td>`;
    tableHTML += `<td class="px-4 py-3">
                    <button class="delete-btn" data-id="${report.id}">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                      </svg>
                      Hapus
                    </button>
                  </td>`;
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody></table>';

  stagingTableContainer.innerHTML = tableHTML;

  // Tambahkan event listener untuk tombol hapus
  stagingTableContainer.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', (e) => {
      const idToDelete = parseFloat(e.currentTarget.dataset.id); // Pastikan parsing ke number
      deleteStagedReport(idToDelete);
    });
  });
}

// Event listener untuk pengiriman formulir laporan (sekarang hanya menambahkan ke daftar sementara)
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const namaHewan = namaHewanInput.value.trim();
  const zona = zonaInput.value;
  const jumlah = parseInt(jumlahInput.value, 10);

  // Validasi Input Client-Side
  if (!namaHewan || !zona || isNaN(jumlah) || jumlah < 1) {
    showStatusMessage('⚠️ Mohon lengkapi semua bidang dengan benar (Nama Hewan, Zona, dan Jumlah harus diisi dengan angka positif).', 'error', statusMessage);
    return;
  }

  addOrUpdateStagedReport(namaHewan, zona, jumlah);

  // Reset input form
  namaHewanInput.value = '';
  jumlahInput.value = '1';
  namaHewanInput.focus();
});

/**
 * Mengirim semua laporan yang ada di stagedReports ke Google Spreadsheet.
 */
submitStagedDataButton.addEventListener('click', async () => {
  if (stagedReports.length === 0) {
    showStatusMessage('Daftar laporan sementara kosong, tidak ada yang perlu disimpan.', 'info', stagingStatusMessage);
    return;
  }

  submitStagedDataButton.disabled = true;
  submitStagedDataButton.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Menyimpan...
  `;
  showStatusMessage(`⏳ Menyimpan ${stagedReports.length} laporan ke Spreadsheet...`, 'info', stagingStatusMessage);

  let successCount = 0;
  let errorMessages = [];

  for (const report of stagedReports) {
    const formData = new FormData();
    formData.append('namaHewan', report.namaHewan);
    formData.append('zona', report.zona);
    formData.append('jumlah', report.jumlah);

    try {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (result.result === 'success') {
        successCount++;
      } else {
        errorMessages.push(`Gagal menyimpan ${report.namaHewan} (${report.zona}): ${result.error || 'Kesalahan tidak diketahui'}`);
      }
    } catch (err) {
      errorMessages.push(`Gagal koneksi untuk ${report.namaHewan} (${report.zona}): ${err.message}`);
    }
  }

  // Setelah semua laporan diproses
  if (errorMessages.length === 0) {
    showStatusMessage(`✅ Berhasil menyimpan ${successCount} laporan ke Spreadsheet!`, 'success', stagingStatusMessage);
    stagedReports = []; // Kosongkan daftar sementara
    saveStagedReports(); // Simpan perubahan ke localStorage
    renderStagingTable(); // Render ulang tabel sementara yang kosong
    loadGlobalSpreadsheetData(); // Muat ulang data global untuk melihat perubahan
  } else {
    showStatusMessage(`⚠️ Berhasil menyimpan ${successCount} laporan. ${errorMessages.length} gagal: ${errorMessages.join('; ')}`, 'error', stagingStatusMessage);
  }

  submitStagedDataButton.disabled = false;
  submitStagedDataButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    Simpan Semua ke Spreadsheet
  `;
  setTimeout(() => {
    stagingStatusMessage.textContent = '';
    stagingStatusMessage.className = 'mt-4 text-center font-medium text-sm min-h-[20px]';
  }, 5000);
});

/**
 * Merender ulang grafik hewan berdasarkan data yang diterima.
 * Memastikan grafik diperbarui secara dinamis tanpa duplikasi.
 * @param {Array<Object>} data - Array objek data laporan hewan (setelah dikonversi dari array of arrays).
 */
function renderChart(data) {
  if (animalChartInstance) {
    animalChartInstance.destroy();
  }

  if (data.length === 0) {
    chartContainer.innerHTML = '<p class="text-center text-slate-500 p-8">Data tidak cukup untuk menampilkan grafik.</p>';
    return;
  }

  let canvas = document.getElementById('animalChart');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'animalChart';
    chartContainer.innerHTML = '';
    chartContainer.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');

  // Filter out non-numeric and non-zona headers
  const zonaHeaders = Object.keys(data[0]).filter(
    (h) => h.toLowerCase().startsWith('zona') && !isNaN(parseInt(data[0][h])) // Ensure it's a zone and has numeric-like data
  );

  const zoneTotals = {};
  zonaHeaders.forEach((zona) => {
    zoneTotals[zona] = data.reduce((sum, row) => sum + (parseInt(row[zona], 10) || 0), 0);
  });

  const chartLabels = Object.keys(zoneTotals);
  const chartData = Object.values(zoneTotals);

  animalChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Total Hewan',
          data: chartData,
          backgroundColor: [
            'rgba(79, 70, 229, 0.8)', // primary-indigo
            'rgba(99, 102, 241, 0.8)', // secondary-indigo
            'rgba(129, 140, 248, 0.8)', // indigo-400
            'rgba(165, 180, 252, 0.8)', // indigo-300
            'rgba(199, 210, 254, 0.8)', // indigo-200
          ],
          borderColor: ['rgba(79, 70, 229, 1)', 'rgba(99, 102, 241, 1)', 'rgba(129, 140, 248, 1)', 'rgba(165, 180, 252, 1)', 'rgba(199, 210, 254, 1)'],
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(30, 41, 59, 0.9)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          cornerRadius: 8,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: '#e2e8f0',
            drawBorder: false,
          },
          ticks: {
            color: '#64748B',
          },
        },
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: '#64748B',
          },
        },
      },
    },
  });
}

/**
 * Menampilkan data laporan global dalam format tabel HTML.
 * @param {Array<Object>} data - Array objek data laporan hewan.
 */
function showGlobalInfo(data) {
  if (data.length === 0) {
    tabelDataContainer.innerHTML = '<p class="p-8 text-center text-slate-500">Belum ada data laporan global yang tersedia.</p>';
    return;
  }

  const headers = Object.keys(data[0]);
  let tableHTML = '<table class="w-full text-sm text-left text-slate-600">';
  tableHTML += '<thead class="text-xs text-slate-700 uppercase bg-slate-100"><tr>';
  headers.forEach((key) => {
    tableHTML += `<th scope="col" class="px-6 py-3">${key.replace(/_/g, ' ')}</th>`;
  });
  tableHTML += '</tr></thead>';
  tableHTML += '<tbody class="bg-white divide-y divide-slate-200">';
  data.forEach((row) => {
    tableHTML += '<tr class="hover:bg-slate-50 transition">';
    headers.forEach((header) => {
      tableHTML += `<td class="px-6 py-4">${row[header] || ''}</td>`;
    });
    tableHTML += '</tr>';
  });
  tableHTML += '</tbody></table>';

  tabelDataContainer.innerHTML = tableHTML;
  searchInput.disabled = false;
}

/**
 * Memuat data laporan dari Google Apps Script dan merender tabel serta grafik global.
 * Menangani konversi format data dari array of arrays menjadi array of objects.
 */
async function loadGlobalSpreadsheetData() {
  showStatusMessage('Memuat data global...', 'info', statusMessage); // Gunakan statusMessage global
  tabelDataContainer.innerHTML = '<p class="p-8 text-center text-slate-500">Memuat data tabel global...</p>';
  chartContainer.innerHTML = '<p class="text-center text-slate-500 p-8">Memuat data grafik global...</p>';
  searchInput.value = '';
  searchInput.disabled = true;

  try {
    const response = await fetch(SCRIPT_URL);
    if (!response.ok) throw new Error(`Gagal terhubung ke server (status: ${response.status})`);
    let data = await response.json();

    if (data.result === 'error') throw new Error(data.error);

    let processedData = [];

    // Periksa apakah data sudah dalam format array of objects
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      processedData = data;
    } else if (Array.isArray(data) && data.length > 1 && Array.isArray(data[0])) {
      // Jika data adalah array of arrays (dengan header di baris pertama)
      const headers = data[0];
      processedData = data.slice(1).map((row) => {
        let obj = {};
        if (Array.isArray(row)) {
          headers.forEach((header, index) => {
            obj[header] = row[index];
          });
        }
        return obj;
      });
    } else {
      showGlobalInfo([]);
      renderChart([]);
      showStatusMessage('Data laporan global kosong atau format data tidak valid.', 'info', statusMessage);
      return;
    }

    if (processedData.length === 0) {
      showGlobalInfo([]);
      renderChart([]);
      showStatusMessage('Data laporan global kosong setelah pemrosesan.', 'info', statusMessage);
      return;
    }

    const sortedData = processedData.sort((a, b) => {
      const key = Object.keys(a)[0]; // Sort by the first column, usually 'Jenis Hewan'
      const valA = (a[key] || '').toString().toLowerCase();
      const valB = (b[key] || '').toString().toLowerCase();
      return valA.localeCompare(valB);
    });

    showGlobalInfo(sortedData);
    renderChart(sortedData);
    showStatusMessage('Data global berhasil dimuat.', 'success', statusMessage);
    setTimeout(() => {
      statusMessage.textContent = '';
      statusMessage.className = 'mt-4 text-center font-medium text-sm min-h-[20px]';
    }, 3000);
  } catch (error) {
    showStatusMessage(`❌ Gagal memuat data global: ${error.message}`, 'error', statusMessage);
    tabelDataContainer.innerHTML = `<p class="p-8 text-center text-error-red">Gagal memuat data tabel global: ${error.message}</p>`;
    chartContainer.innerHTML = `<p class="text-center text-error-red p-8">Gagal memuat data grafik global.</p>`;
    console.error('Error loading global data:', error);
  }
}

/**
 * Memfilter baris tabel global berdasarkan nilai yang dimasukkan di input pencarian.
 */
function filterTable() {
  const searchTerm = searchInput.value.toLowerCase();
  const table = tabelDataContainer.querySelector('table');
  if (!table) return;

  const rows = table.getElementsByTagName('tr');
  // Loop mulai dari 1 untuk melewati baris header
  for (let i = 1; i < rows.length; i++) {
    rows[i].style.display = rows[i].textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
  }
}

// ==== EVENT LISTENERS ====
window.addEventListener('DOMContentLoaded', () => {
  loadStagedReports(); // Muat laporan sementara dari localStorage saat DOM dimuat
});

refreshButton.addEventListener('click', loadGlobalSpreadsheetData); // Refresh hanya memuat data global
searchInput.addEventListener('keyup', filterTable);

downloadExcelButton.onclick = function () {
  const downloadUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx`;
  window.open(downloadUrl, '_blank');
};

// Modifikasi event listener untuk tombol hewan (sekarang menambahkan ke daftar sementara)
document.querySelectorAll('.hewan-btn').forEach((btn) => {
  btn.addEventListener('click', function () {
    const namaHewan = this.textContent;
    const zona = zonaInput.value; // Ambil zona yang sedang dipilih

    // Validasi dasar
    if (!zona) {
      showStatusMessage('⚠️ Mohon pilih Zona terlebih dahulu sebelum menambahkan hewan.', 'error', statusMessage);
      return;
    }

    addOrUpdateStagedReport(namaHewan, zona, 1); // Tambahkan dengan jumlah 1
    jumlahInput.value = 1; // Reset jumlah input ke 1 setelah ditambahkan
  });
});

// Fungsi Utilities (Dibutuhkan untuk formatDate)
// Ini adalah stub karena fungsi Utilities.formatDate hanya tersedia di lingkungan Google Apps Script.
// Untuk menjalankannya di browser, kita perlu implementasi alternatif atau menggunakan library date/time.
// Untuk demo ini, kita akan membuat implementasi sederhana yang mengembalikan string waktu sekarang.
// Di lingkungan Google Apps Script yang sebenarnya, fungsi Utilities.formatDate akan bekerja.
const Utilities = {
  formatDate: (date, timeZone, format) => {
    // Implementasi sederhana untuk tujuan demo browser
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timeZone, // Gunakan timeZone untuk konsistensi meskipun implementasi sederhana
    };
    if (format.includes('EEEE')) {
      return date.toLocaleDateString('id-ID', { weekday: 'long', timeZone: timeZone });
    } else if (format.includes('dd/MM/yyyy')) {
      return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timeZone });
    } else if (format.includes('HH:mm')) {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timeZone });
    }
    return date.toLocaleString('id-ID', options);
  },
};

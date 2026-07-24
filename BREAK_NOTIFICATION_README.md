# 📢 Break Notification System

Sistem notifikasi mewah untuk manajemen istirahat staff dengan animasi premium dan pesan random.

## ✨ Fitur Utama

### 1. **Pesan Random (12 Variasi per Kategori)**
- 🏖️ **Mulai Istirahat**: 12 variasi pesan saat staff izin istirahat
- ✅ **Kembali On Time**: 12 variasi pesan apresiasi kedisiplinan
- ⚠️ **Kembali Terlambat**: 12 variasi pesan pengingat kedisiplinan

### 2. **Animasi Premium**
- **BounceIn**: Efek masuk dengan mental yang smooth
- **Shimmer**: Kilau bergerak horizontal terus-menerus
- **Pulse**: Icon berkedip halus (scale & opacity)
- **Particles**: Efek lingkaran memudar dari tengah
- **Shadow 3D**: Kesan depth yang kuat

### 3. **Durasi Tampil**

| Jenis Notifikasi | Durasi | Behavior |
|------------------|--------|----------|
| 🏖️ Mulai Istirahat | **Persistent** | Tetap tampil sampai staff tekan "Selesai Istirahat" |
| ✅ Kembali On Time | **1 Menit** | Auto-hide setelah 60 detik |
| ⚠️ Kembali Terlambat | **1 Menit** | Auto-hide setelah 60 detik |

### 4. **Theme Gradient**
- **Info (Mulai)**: Gradient ungu-biru (`#667eea` → `#764ba2`)
- **Success (On Time)**: Gradient hijau-tosca (`#11998e` → `#38ef7d`)
- **Warning (Terlambat)**: Gradient pink-merah (`#f093fb` → `#f5576c`)

## 🎯 Cara Kerja

### Flow Notifikasi:

```
Staff Mulai Istirahat
    ↓
Tampil notifikasi (PERSISTENT - tetap show)
    ↓
Staff Selesai Istirahat
    ↓
Hide notifikasi persistent
    ↓
Tampil notifikasi baru (On Time / Terlambat)
    ↓
Auto-hide setelah 1 menit
```

## 📁 File yang Terlibat

### 1. **index.html**
```html
<div id="breakNotificationContainer" class="break-notification-container"></div>
```
Container untuk notifikasi di bagian atas frame staffConsole.

### 2. **css/styles.css**
Semua styling dan animasi notifikasi:
- `.break-notification-container`
- `.break-notification`
- `.break-notification-icon`
- `.break-notification-text`
- Keyframes animations

### 3. **app.js**

#### Fungsi Utama:

**`showBreakNotification(message, type, persistent)`**
- `message`: Teks yang ditampilkan
- `type`: `'info'` | `'success'` | `'warning'`
- `persistent`: `true` = tetap tampil, `false` = auto-hide 1 menit

**`hideBreakNotification()`**
- Menghapus notifikasi persistent secara manual

#### Array Pesan:
- `BREAK_START_MESSAGES`: 12 pesan mulai istirahat
- `BREAK_END_ONTIME_MESSAGES`: 12 pesan on time
- `BREAK_END_LATE_MESSAGES`: 12 pesan terlambat

## 🧪 Testing

Buka file `test-break-notification.html` di browser untuk demo interaktif:

1. **Test Mulai Istirahat** → Notifikasi tetap tampil
2. **Test Kembali On Time** → Notifikasi hilang setelah 1 menit
3. **Test Kembali Terlambat** → Notifikasi hilang setelah 1 menit

## 📱 Responsive Design

Notifikasi otomatis menyesuaikan untuk:
- 💻 Desktop (max-width: 700px)
- 📱 Mobile (width: 95%, font lebih kecil)

## 🔧 Contoh Implementasi

### Mulai Istirahat (Persistent):
```javascript
const randomMessage = getRandomMessage(BREAK_START_MESSAGES);
showBreakNotification(randomMessage, 'info', true); // persistent = true
```

### Selesai Istirahat On Time:
```javascript
hideBreakNotification(); // hapus persistent notification
const randomMessage = getRandomMessage(BREAK_END_ONTIME_MESSAGES);
showBreakNotification(randomMessage, 'success', false); // auto-hide 1 menit
```

### Selesai Istirahat Terlambat:
```javascript
hideBreakNotification(); // hapus persistent notification
const randomMessage = getRandomMessage(BREAK_END_LATE_MESSAGES);
showBreakNotification(randomMessage, 'warning', false); // auto-hide 1 menit
```

## 🎨 Customization

### Mengubah Durasi Auto-Hide:
Edit di `app.js` fungsi `showBreakNotification()`:
```javascript
}, 60000); // 60000ms = 1 menit
```

### Menambah Pesan Baru:
Tambahkan string ke array di `app.js`:
```javascript
const BREAK_START_MESSAGES = [
    "Pesan lama...",
    "Pesan baru Anda di sini! 🎉"
];
```

### Mengubah Warna Gradient:
Edit di `css/styles.css`:
```css
.break-notification.success {
    background: linear-gradient(135deg, #YOUR_COLOR_1 0%, #YOUR_COLOR_2 100%);
}
```

## ✅ Status

- [x] HTML Structure
- [x] CSS Animations
- [x] JavaScript Logic
- [x] Random Messages (12 each)
- [x] Persistent for Start Break
- [x] Auto-hide 1 minute for End Break
- [x] Test File
- [x] Responsive Design
- [x] Integration with app.js

---

**Dibuat oleh**: Kiro AI Assistant  
**Tanggal**: 2026  
**Versi**: 3.0 - ULTRA LUXURY PREMIUM EDITION  

## 🎨 Ultra Luxury Features

### Premium Visual Effects:
- **Rotating Shimmer**: Gradient berputar 360° yang terus bergerak
- **Glowing Border**: Border yang berkedip dengan animasi smooth
- **3D Bounce**: Animasi masuk dengan rotasi dan scale yang dramatis
- **Icon Glow**: Radiasi cahaya dari icon yang berpulsasi
- **Floating Particles**: Partikel yang mengambang secara acak
- **Sparkle Stars**: Bintang berkilau di berbagai posisi
- **Confetti Rain**: Hujan confetti untuk success notification
- **Progress Bar**: Visual countdown 1 menit untuk auto-hide
- **Warning Pulse**: Efek berkedip khusus untuk terlambat
- **Multi-layer Shadows**: Shadow berlapis untuk depth maksimal
- **Backdrop Blur**: Glass morphism dengan blur effect

### Advanced Animations:
- Cubic-bezier easing untuk pergerakan smooth
- Multi-stage keyframe animations
- Staggered animation delays
- Rotate & scale transformations
- Opacity transitions
- Filter effects (drop-shadow, blur)

### Premium Color Themes:
- **Info**: Royal Purple gradient dengan glow biru
- **Success**: Emerald Green gradient dengan confetti gold
- **Warning**: Rose Gold gradient dengan pulse effect

---

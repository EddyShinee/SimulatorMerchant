# Simulator Merchant

Ứng dụng full-stack mô phỏng merchant: đăng ký / đăng nhập, lưu tài khoản dạng **CSV**, giao diện song ngữ **Tiếng Việt / English**, thiết kế responsive với **Tailwind CSS** và **React (Vite)**. Tính năng chính: gọi API bên ngoài và một trang nhận request **GET/POST**.

> A full-stack merchant simulator: register / login, **CSV**-backed accounts, bilingual **Vietnamese / English** UI, responsive design built with **Tailwind CSS** and **React (Vite)**. Core features: an outbound API caller and an inbound **GET/POST** request receiver.

---

## Tính năng / Features

- 🔐 Đăng ký & đăng nhập (JWT + bcrypt). Tài khoản lưu trong file CSV (`email`, `password` đã băm).
- 🛡️ Bảo vệ route: phải đăng nhập mới vào được trang Simulator Merchant.
- 🧭 Bố cục: **menu bên trái + nội dung bên phải**, responsive (điện thoại & máy tính).
- 🌐 Song ngữ Tiếng Việt / English, có nút chuyển ngôn ngữ.
- 🎨 Giao diện hiện đại, sạch sẽ với Tailwind CSS.
- 📡 **API Caller**: gửi GET/POST/PUT/PATCH/DELETE đến API bất kỳ và xem phản hồi.
- 📥 **Request Inbox**: trang đón request GET/POST gửi đến (webhook) và kiểm tra nội dung.
- ⚙️ Biến môi trường lưu trong file `.env`.
- 🚀 Dễ dàng build & deploy với Vite.

---

## Cấu trúc dự án / Project structure

```
Simulator/
├── index.html
├── package.json            # Frontend + scripts (Vite, React) and shared deps
├── vite.config.js          # Vite config + dev proxy (/api -> backend)
├── tailwind.config.js
├── postcss.config.js
├── .env                    # Frontend env (VITE_*)
├── .env.example
├── src/                    # React frontend
│   ├── main.jsx
│   ├── App.jsx             # Routes
│   ├── index.css           # Tailwind + component styles
│   ├── api/client.js       # Axios instance + token handling
│   ├── context/            # AuthContext, LanguageContext
│   ├── i18n/translations.js
│   ├── components/         # Sidebar items, LanguageSwitcher, icons, etc.
│   ├── layouts/SimulatorLayout.jsx  # left menu + right content
│   └── pages/              # Login, Register, Dashboard, ApiCaller, RequestInbox
└── server/                 # Express backend
    ├── index.js
    ├── .env                # Backend env (PORT, JWT_SECRET, ...)
    ├── .env.example
    ├── routes/             # auth.js, simulator.js
    ├── middleware/auth.js
    ├── utils/csv.js        # CSV read/append for users
    └── data/users.csv      # created automatically at runtime
```

---

## Cài đặt / Setup

Yêu cầu: **Node.js 18+**.

```bash
# 1. Cài dependencies (frontend + backend dùng chung 1 package.json)
npm install

# 2. Tạo file .env từ mẫu
cp .env.example .env
cp server/.env.example server/.env
# (Đổi JWT_SECRET trong server/.env khi chạy production)
```

---

## Chạy ở chế độ phát triển / Run in development

```bash
npm run dev
```

- Frontend (Vite): http://localhost:5173
- Backend (Express API): http://localhost:4000
- Vite proxy tự chuyển tiếp `/api/*` sang backend, nên không cần cấu hình CORS khi dev.

Bạn cũng có thể chạy riêng:

```bash
npm run dev:server   # chỉ backend
npm run dev:client   # chỉ frontend
```

---

## Build & Deploy

### Frontend (Vite)

```bash
npm run build      # tạo thư mục dist/
npm run preview    # xem thử bản build
```

Deploy `dist/` lên bất kỳ static host nào (Vercel, Netlify, ...). Đặt biến
`VITE_API_BASE_URL` trỏ tới URL backend khi deploy tách biệt.

### Full-stack (1 server)

Backend đã được cấu hình để phục vụ luôn thư mục `dist/`:

```bash
npm run build
npm start          # chạy server/index.js, phục vụ API + frontend tại :4000
```

### Deploy lên Vercel

Dự án đã có sẵn `vercel.json` + `api/index.js` để chạy full-stack trên Vercel:
frontend build tĩnh (Vite) và backend Express chạy dưới dạng **Serverless Function**
(mọi request `/api/*` được rewrite vào `api/index.js`).

```bash
npm i -g vercel       # nếu chưa có
vercel                # deploy preview
vercel --prod         # deploy production
```

Hoặc: đẩy code lên GitHub rồi “Import Project” trên dashboard Vercel (framework tự nhận là Vite).

**Biến môi trường cần đặt trên Vercel** (Project Settings → Environment Variables):

| Biến | Gợi ý |
| --- | --- |
| `JWT_SECRET` | chuỗi ngẫu nhiên đủ dài (**bắt buộc đặt** cho production) |
| `JWT_EXPIRES_IN` | `12h` |
| `BCRYPT_SALT_ROUNDS` | `10` |
| `CORS_ORIGIN` | `*` (hoặc domain Vercel của bạn) |

> ⚠️ **Lưu ý quan trọng khi chạy trên Vercel (serverless):**
> - File hệ thống chỉ ghi được vào `/tmp` và **bị xóa khi cold start**. Vì vậy tài
>   khoản lưu trong CSV (`/tmp/users.csv`) **không bền** — có thể phải đăng ký lại
>   sau một thời gian không hoạt động. Nếu cần lưu tài khoản lâu dài, hãy chuyển
>   sang DB (vd Vercel Postgres/Supabase) hoặc deploy backend ở host có ổ đĩa bền
>   (Render/Railway) rồi đặt `VITE_API_BASE_URL` trỏ tới đó.
> - Các request đã nhận (Request Inbox) lưu trong RAM nên cũng reset theo instance.
> - File key mặc định Payment Action (`src/KeyPaymentAction/`) được đóng gói vào
>   function qua `includeFiles`. **Không nên** commit/triển khai private key thật lên
>   môi trường công khai — chỉ dùng key sandbox/test.

---

## Biến môi trường / Environment variables

**Frontend (`.env`)**

| Biến                    | Mô tả                                                         |
| ----------------------- | ------------------------------------------------------------- |
| `VITE_PORT`             | Cổng dev server của Vite (mặc định 5173)                      |
| `VITE_API_BASE_URL`     | URL backend khi production. Để trống khi dev (dùng proxy).    |
| `VITE_DEV_PROXY_TARGET` | Địa chỉ backend mà Vite proxy chuyển tiếp `/api` đến.         |

**Backend (`server/.env`)**

| Biến                 | Mô tả                                            |
| -------------------- | ------------------------------------------------ |
| `PORT`               | Cổng API server (mặc định 4000)                  |
| `JWT_SECRET`         | Khóa bí mật ký JWT (**đổi khi production**)       |
| `JWT_EXPIRES_IN`     | Thời hạn token (vd `12h`, `7d`)                  |
| `BCRYPT_SALT_ROUNDS` | Số vòng salt của bcrypt                           |
| `USERS_CSV_PATH`     | Đường dẫn file CSV lưu user                       |
| `CORS_ORIGIN`        | Origin được phép (phân tách bằng dấu phẩy, hoặc `*`) |

---

## API

| Method | Endpoint                       | Auth | Mô tả                                   |
| ------ | ------------------------------ | ---- | --------------------------------------- |
| POST   | `/api/auth/register`           | ❌   | Đăng ký `{ email, password }`           |
| POST   | `/api/auth/login`              | ❌   | Đăng nhập `{ email, password }`         |
| GET    | `/api/auth/me`                 | ✅   | Thông tin user hiện tại                 |
| ANY    | `/api/simulator/hook`          | ❌   | **Đón request GET/POST** (webhook)      |
| GET    | `/api/simulator/requests`      | ✅   | Danh sách request đã nhận               |
| DELETE | `/api/simulator/requests`      | ✅   | Xóa toàn bộ request đã nhận             |
| POST   | `/api/simulator/proxy`         | ✅   | Gọi API bên ngoài và trả về phản hồi    |
| GET    | `/api/health`                  | ❌   | Kiểm tra trạng thái server              |

### Thử trang đón request / Try the receiver

```bash
curl -X POST "http://localhost:4000/api/simulator/hook" \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.success","amount":1000}'
```

Mở trang **Request Inbox** trong app để xem request vừa gửi.

---

## Ghi chú bảo mật / Security notes

- Mật khẩu được băm bằng bcrypt trước khi lưu vào CSV — không lưu plaintext.
- File `.env` và `server/data/*.csv` đã được thêm vào `.gitignore`.
- Hãy đổi `JWT_SECRET` thành chuỗi ngẫu nhiên đủ dài trước khi deploy.

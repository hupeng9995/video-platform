# 🎬 分布式视频平台项目

一个基于Docker的分布式视频处理和播放平台，支持视频上传、转码、切片、加密存储和流媒体播放。

## 🚀 项目特性

### 核心功能
- 🎥 **视频管理**: 支持多格式视频上传、转码和存储
- 👥 **用户系统**: 完整的用户注册、登录和权限管理
- 🎮 **视频播放**: 自适应码率流媒体播放
- 🔐 **安全保护**: JWT认证、文件加密、防盗链
- 📊 **管理后台**: 用户管理、视频审核、系统监控
- 🔄 **分布式架构**: 微服务架构，支持水平扩展

### 技术架构
- **前端**: Next.js + React + TypeScript + Tailwind CSS
- **后台管理**: React + TypeScript + Vite
- **API服务**: Node.js + Express + JWT
- **数据库**: MySQL + Redis
- **视频处理**: FFmpeg + HLS
- **容器化**: Docker + Docker Compose

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   用户前端      │    │  管理员后台     │    │   API服务器     │
│  (localhost:3001)│    │ (localhost:3002)│    │ (localhost:3000)│
│                 │    │                 │    │                 │
│ - 视频播放      │    │ - 用户管理      │    │ - 视频处理      │
│ - 用户交互      │    │ - 视频审核      │    │ - 转码服务      │
│ - 文件上传      │    │ - 系统监控      │    │ - API接口       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                          ┌─────────────────┐    ┌─────────────────┐
                          │   MySQL数据库   │    │   Redis缓存     │
                          │ (localhost:3306)│    │ (localhost:6379)│
                          └─────────────────┘    └─────────────────┘
```

## 📦 项目结构

```
video-platform/
├── api-server/              # API服务器
│   ├── src/
│   │   ├── controllers/     # 控制器
│   │   ├── models/          # 数据模型
│   │   ├── routes/          # 路由配置
│   │   ├── middleware/      # 中间件
│   │   ├── services/        # 业务服务
│   │   └── utils/           # 工具函数
│   ├── Dockerfile
│   └── package.json
├── user-frontend/           # 用户前端
│   ├── src/
│   │   ├── app/             # Next.js应用
│   │   └── contexts/        # React上下文
│   ├── Dockerfile
│   └── package.json
├── admin-dashboard/         # 管理后台
│   ├── src/
│   │   ├── components/      # React组件
│   │   └── utils/           # 工具函数
│   ├── Dockerfile
│   └── package.json
├── database/                # 数据库脚本
│   ├── init.sql            # 初始化脚本
│   └── *.sql               # 迁移脚本
├── DOC/                     # 项目文档
└── docker-compose.yml       # Docker编排文件
```

## 🚀 快速开始

### 环境要求
- Docker Desktop
- Docker Compose
- Git

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/hupeng9995/video-platform.git
   cd video-platform
   ```

2. **配置环境变量**
   ```bash
   # 复制环境变量模板
   cp api-server/.env.example api-server/.env
   cp user-frontend/.env.local.example user-frontend/.env.local
   ```

3. **启动服务**
   ```bash
   # 构建并启动所有服务
   docker-compose up -d
   
   # 查看服务状态
   docker-compose ps
   ```

4. **访问应用**
   - 用户前端: http://localhost:3001
   - 管理后台: http://localhost:3002
   - API文档: http://localhost:3000/api-docs

### 默认账号
- **管理员账号**: admin / 111111
- **数据库**: root / root123456

## 🔧 开发指南

### 本地开发

```bash
# 启动开发环境
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose logs -f api-server
docker-compose logs -f user-frontend
docker-compose logs -f admin-dashboard

# 重新构建服务
docker-compose build --no-cache
```

### API测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 用户注册
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","email":"test@example.com","password":"123456"}'

# 用户登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123456"}'
```

## 📹 视频处理流程

### 上传流程
1. 用户选择视频文件
2. 前端分片上传到API服务器
3. 服务器验证文件格式和大小
4. 存储到临时目录并返回上传ID

### 处理流程
1. **视频转码**: 转换为标准格式(MP4/H.264)
2. **多分辨率**: 生成1080p、720p、480p、360p
3. **视频切片**: 按时间切片生成HLS格式
4. **文件加密**: AES-128加密保护内容
5. **缩略图**: 提取关键帧生成预览图

### 播放流程
1. 用户请求播放视频
2. 验证用户权限
3. 获取解密密钥和播放列表
4. 提供HLS流媒体服务
5. 前端播放器自适应码率播放

## 🔐 安全特性

- **JWT认证**: 无状态的用户认证
- **文件加密**: AES-128加密视频内容
- **防盗链**: 域名白名单和时效性URL
- **权限控制**: 基于角色的访问控制
- **输入验证**: 严格的参数验证和过滤
- **SQL注入防护**: 参数化查询

## 📊 监控和日志

### 日志系统
- **访问日志**: 记录所有API请求
- **错误日志**: 记录系统错误和异常
- **安全日志**: 记录登录和权限相关操作
- **审计日志**: 记录重要业务操作

### 性能监控
- **响应时间**: API接口响应时间统计
- **并发处理**: 并发请求处理能力
- **资源使用**: CPU、内存、磁盘使用情况
- **错误率**: 系统错误率和成功率

## 🛠️ 故障排除

### 常见问题

1. **容器启动失败**
   ```bash
   # 检查容器状态
   docker-compose ps
   
   # 查看错误日志
   docker-compose logs [service-name]
   
   # 重新构建
   docker-compose build --no-cache
   ```

2. **数据库连接失败**
   ```bash
   # 检查数据库容器
   docker-compose logs mysql
   
   # 测试连接
   docker exec -it video-platform-mysql mysql -uroot -proot123456
   ```

3. **前端API调用失败**
   - 检查环境变量配置
   - 验证容器间网络连通性
   - 查看API服务器日志

## 📚 文档

- [API接口文档](./DOC/API接口文档.md)
- [数据库设计文档](./DOC/数据库设计文档.md)
- [开发环境搭建指南](./DOC/开发环境搭建指南.md)
- [部署运维文档](./DOC/部署运维文档.md)
- [项目规划文档](./DOC/项目规划文档.md)

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 👥 作者

- **hupeng9995** - *初始工作* - [hupeng9995](https://github.com/hupeng9995)

## 🙏 致谢

- 感谢所有贡献者的努力
- 感谢开源社区提供的优秀工具和库
- 特别感谢 Docker、Node.js、React 等技术栈的支持

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
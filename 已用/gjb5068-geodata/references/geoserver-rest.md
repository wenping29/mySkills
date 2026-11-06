# GeoServer REST 发布参考

## 前置

- GeoServer 2.20+
- MongoDB 数据源需 `gs-mongodb-plugin`，版本必须与 GeoServer 完全一致，放入 `WEB-INF/lib` 后重启
- REST 地址：`http://{host}:8080/geoserver/rest`
- Basic Auth：`Authorization: Basic base64(user:password)`

## 发布顺序

### 1. 创建工作区

```http
POST /rest/workspaces
Content-Type: application/json

{
  "workspace": {
    "name": "ws_name",
    "uri": "http://example/ws_name"
  }
}
```

- 201 Created：成功
- 409 Conflict：已存在，可跳过

### 2. 创建数据存储（MongoDB）

```http
POST /rest/workspaces/{ws}/datastores
Content-Type: application/json

{
  "dataStore": {
    "name": "mongo_store",
    "type": "MongoDB",
    "connectionParameters": {
      "entry": [
        {"key": "host", "value": "mongo-host"},
        {"key": "port", "value": "27017"},
        {"key": "database", "value": "db_name"},
        {"key": "user", "value": "user"},
        {"key": "passwd", "value": "password"},
        {"key": "authdb", "value": "admin"},
        {"key": "dbtype", "value": "mongodb"},
        {"key": "connectTimeout", "value": "30000"}
      ]
    }
  }
}
```

### 3. 发布要素类型/图层

```http
POST /rest/workspaces/{ws}/datastores/{store}/featuretypes
Content-Type: application/json

{
  "featureType": {
    "name": "collection_name",
    "nativeName": "collection_name",
    "title": "collection_name",
    "srs": "EPSG:4326",
    "nativeCRS": "EPSG:4326",
    "projectionPolicy": "FORCE_DECLARED",
    "enabled": true,
    "attributes": {
      "attribute": [
        {
          "name": "geom",
          "type": "Geometry",
          "binding": "org.locationtech.jts.geom.Geometry"
        }
      ]
    }
  }
}
```

要点：

- `name/nativeName` 与集合名一致
- `srs/nativeCRS` 与数据一致（WGS84 用 EPSG:4326）
- 几何字段名大小写敏感
- 点用 Point、线用 LineString、面用 Polygon、混合用 Geometry
- `binding` 固定 `org.locationtech.jts.geom.Geometry`

### 4. 配样式

```http
POST /rest/workspaces/{ws}/styles
Content-Type: application/vnd.ogc.sld+xml
```

或上传 SLD 后，把样式绑定到图层：

```http
PUT /rest/layers/{ws}:{layer}
Content-Type: application/json

{
  "layer": {
    "defaultStyle": {"name": "style_name"}
  }
}
```

### 5. 图层组

```http
POST /rest/workspaces/{ws}/layergroups
Content-Type: application/json

{
  "layerGroup": {
    "name": "group_name",
    "workspace": {"name": "ws_name"},
    "layers": [
      {"name": "ws:layer_a"},
      {"name": "ws:layer_b"}
    ],
    "styles": [
      {"name": "style_a"},
      {"name": "style_b"}
    ]
  }
}
```

显示规则按缩放级别在图层组中配置；顺序即叠放顺序，先底图后专题。

### 6. 缓存切片

```http
POST /rest/gwc/layers/{ws}:{layer}.json
```

或在图层组上 seed。只对稳定图层开启；频繁变更的图层先不缓存。

## 验证

1. 后台查看工作区、数据存储、图层是否存在
2. 图层预览：`/web` 或 `/wms?service=WMS&request=GetMap...`
3. 检查要素数量与属性
4. 检查坐标系与范围
5. 检查图层组缩放显示规则
6. 抽查切片是否生成

## 常见错误

| 状态码 | 原因 |
|--------|------|
| 401 | 账号密码错误 |
| 404 | 工作区/存储/图层路径错误 |
| 409 | 资源已存在，可跳过或先删除 |
| 500 | 插件缺失、连接参数错误、几何字段不存在 |

## C# 调用要点

- 用 `HttpClient` + Basic Auth
- `StringContent(json, Encoding.UTF8, "application/json")`
- 201 成功；409 视为已存在；其他状态码读取响应体作为错误信息
- 所有配置参数集中在一个 region，避免散落

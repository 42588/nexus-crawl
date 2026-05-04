import pandas as pd
import numpy as np
from datetime import datetime, timezone
from core.context import PipelineContext
from core.logger import log_queue

async def execute_ml_cleaning(node_config: dict, context: PipelineContext):
    # 接收前端参数
    fill_missing = node_config.get("fillMissing", "none")
    outlier_method = node_config.get("outliers", "none")  # 新增: iqr_clip, iqr_drop, zscore_clip, zscore_drop
    drop_duplicates = node_config.get("dropDuplicates", False)
    scale_method = node_config.get("scale", "none")
    encode_method = node_config.get("encode", "none")
    
    target_field = node_config.get("dataField", "context.extracted_data.read_data")
    if not target_field:
        target_field = "context.extracted_data.read_data"
        
    from nodes.app_nodes import _get_nested_property, _set_nested_property
    data_obj = _get_nested_property(context, target_field)
    
    if not data_obj:
        await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": f"[Trace: {context.trace_id}] ML清洗中止：目标字段 {target_field} 为空。"})
        return context

    # 1. 安全的数据加载与 DataFrame 构建
    df = None
    try:
        if isinstance(data_obj, list):
            df = pd.DataFrame(data_obj)
        elif isinstance(data_obj, dict):
            list_keys = [k for k, v in data_obj.items() if isinstance(v, list)]
            if len(list_keys) == 1:
                df = pd.DataFrame(data_obj[list_keys[0]])
            else:
                df = pd.DataFrame([data_obj])
        else:
            return context
    except Exception as e:
        await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"DataFrame 转换失败: {str(e)}"})
        return context

    if df.empty: return context

    initial_size = len(df)
    await log_queue.put({
        "type": "log", "level": "信息", "color": "\x1b[36m", 
        "message": f"[Trace: {context.trace_id}] 启动 ML 数据提纯引擎 (输入: {initial_size} 行, {len(df.columns)} 列)", 
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    try:
        # ==========================================
        # 预处理：将隐性脏数据暴露为标准 NaN
        # ==========================================
        df = df.replace([np.inf, -np.inf], np.nan)
        df = df.replace(r'^\s*$', np.nan, regex=True) # 把全空格的假字符串变为 NaN

        # 区分特征类型（核心防护：隔离连续值与分类值）
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        cat_cols = df.select_dtypes(exclude=[np.number]).columns.tolist()

        # ==========================================
        # 步骤 1: 去重 (Drop Duplicates)
        # ==========================================
        if drop_duplicates:
            df = df.drop_duplicates()

        # ==========================================
        # 步骤 2: 缺失值插补 (Missing Values)
        # ==========================================
        if fill_missing != "none":
            if fill_missing == "drop":
                df = df.dropna()
            else:
                # 数值列的填充
                if num_cols:
                    if fill_missing == "mean":
                        df[num_cols] = df[num_cols].fillna(df[num_cols].mean())
                    elif fill_missing == "median":
                        df[num_cols] = df[num_cols].fillna(df[num_cols].median())
                    elif fill_missing == "mode":
                        # 循环处理，防止某列全空导致 mode() 越界
                        for col in num_cols:
                            m = df[col].mode()
                            df[col] = df[col].fillna(m.iloc[0]) if not m.empty else df[col].fillna(0)
                    elif fill_missing == "constant_zero":
                        df[num_cols] = df[num_cols].fillna(0)
                
                # 类别列的填充 (分类数据不能算均值，只能用众数或常量)
                if cat_cols:
                    if fill_missing in ["mean", "median", "mode"]:
                        for col in cat_cols:
                            m = df[col].mode()
                            df[col] = df[col].fillna(m.iloc[0]) if not m.empty else df[col].fillna("Unknown")
                    elif fill_missing == "constant_zero":
                        df[cat_cols] = df[cat_cols].fillna("Unknown")

        # ==========================================
        # 步骤 3: 异常值处理 (Outliers) - 仅限数值列
        # ==========================================
        if outlier_method != "none" and num_cols:
            for col in num_cols:
                # 排除全空列，防止计算四分位数报错
                if df[col].isnull().all(): continue
                
                if "iqr" in outlier_method:
                    Q1 = df[col].quantile(0.25)
                    Q3 = df[col].quantile(0.75)
                    IQR = Q3 - Q1
                    lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
                    
                    if outlier_method == "iqr_clip":
                        df[col] = np.clip(df[col], lower, upper) # 盖帽法 (极值拉平)
                    elif outlier_method == "iqr_drop":
                        df = df[((df[col] >= lower) & (df[col] <= upper)) | (df[col].isna())] # 剔除法 (删行)，但放过空值
                        
                elif "zscore" in outlier_method:
                    mean, std = df[col].mean(), df[col].std()
                    if std > 0: # 避免除以 0
                        z_scores = (df[col] - mean) / std
                        if outlier_method == "zscore_clip":
                            df[col] = np.where(z_scores > 3, mean + 3*std, np.where(z_scores < -3, mean - 3*std, df[col]))
                        elif outlier_method == "zscore_drop":
                            # 剔除异常值，但放过空值（让空值按用户的意愿保留）
                            df = df[(np.abs(z_scores) <= 3) | (df[col].isna())]

        # ==========================================
        # 步骤 4: 类别编码 (Encoding) - 仅限类别列
        # ==========================================
        if encode_method != "none" and cat_cols:
            if encode_method == "label":
                for col in cat_cols:
                    # 强转字符串，避免 mixed types 报错，随后分配整数 ID
                    df[col] = df[col].astype(str).astype('category').cat.codes
            elif encode_method == "one_hot":
                # dummy_na=False 忽略空值（前面已填充），drop_first=False 保留全矩阵，dtype=int 强制输出 0/1 防止 boolean 引发后续报错
                df = pd.get_dummies(df, columns=cat_cols, dummy_na=False, dtype=int)

        # ==========================================
        # 步骤 5: 特征缩放 (Scaling)
        # ==========================================
        # 极度重要：只能对“原始的数值列”进行缩放，坚决不缩放 One-Hot 产生的 0/1 列！
        valid_scale_cols = [c for c in num_cols if c in df.columns] 
        
        if scale_method in ["standard", "minmax"] and valid_scale_cols:
            try:
                if scale_method == "standard":
                    from sklearn.preprocessing import StandardScaler
                    df[valid_scale_cols] = StandardScaler().fit_transform(df[valid_scale_cols])
                elif scale_method == "minmax":
                    from sklearn.preprocessing import MinMaxScaler
                    df[valid_scale_cols] = MinMaxScaler().fit_transform(df[valid_scale_cols])
            except ImportError:
                await log_queue.put({"type": "log", "level": "警告", "color": "\x1b[33m", "message": "跳过缩放：缺少 scikit-learn 库。"})

        # ==========================================
        # 最终输出与 JSON 序列化安全兜底
        # ==========================================
        # 再次清理运算过程中可能产生的 inf 或 NaN，全部转为 None 供 JSON 使用
        df = df.replace([np.inf, -np.inf], np.nan)
        df = df.where(pd.notna(df), None)
        
        cleaned_data = df.to_dict(orient="records")
        
        if isinstance(data_obj, dict) and 'list_keys' in locals() and len(list_keys) == 1:
            data_obj[list_keys[0]] = cleaned_data
            export_data = data_obj
        else:
            export_data = cleaned_data
            
        _set_nested_property(context, target_field, export_data)
            
        await log_queue.put({
            "type": "log", "level": "完成", "color": "\x1b[1;32m", 
            "message": f"[Trace: {context.trace_id}] ML清洗完毕: {initial_size}行 -> {len(df)}行，列扩展至 {len(df.columns)}。已安全覆写！", 
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
            
    except Exception as e:
         await log_queue.put({"type": "log", "level": "错误", "color": "\x1b[31m", "message": f"[Trace: {context.trace_id}] 机器学习管道熔断: {str(e)}", "timestamp": datetime.now(timezone.utc).isoformat()})
         
    return context

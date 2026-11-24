"""python -m kokoro_measure [--host 127.0.0.1] [--port 8790]"""

import argparse
import os

from .service import DEFAULT_ORIGINS, make_server


def main():
    parser = argparse.ArgumentParser(description="코코로 사진 실측 로컬 서버")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8790)
    args = parser.parse_args()
    origins = [o for o in os.environ.get("KOKORO_MEASURE_ORIGINS", "").split(",") if o] or DEFAULT_ORIGINS

    from .models import ModelMeasurer

    print("모델을 올리는 중... (처음 실행이면 내려받기까지 몇 분 걸려요)")
    server = make_server(ModelMeasurer(), args.host, args.port, origins=origins)
    print(f"준비 완료: http://{args.host}:{args.port}  허용 주소: {', '.join(origins)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

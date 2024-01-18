---
title: "Effective Java - 아이템 8: finalizer와 cleaner 사용을 피하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

자바는 두 가지 객체 소멸자를 제공한다. 
`finalizer`는 예측할 수 없고, 상황에 따라 위험할 수 있어 일반적으로 불필요하다. 그래서 기본적으로 쓰지 말아야 한다.
`finalizer`의 대안으로 나온`cleaner`는 `finalizer`보다는 덜 위험하지만, 여전히 예측할 수 없고, 느리고, 일반적으로 불필요하다.

자바의 `finalizer`, `cleaner`는 C++의 파괴자(destructor)와 다른 개념이다.
C++에서 파괴자(생성자의 꼭 필요한 대척점)는 특정 객체와 관련된 자원을 회수하는 보편적인 방법이다.
자바에서는 접근할 수 없게 된 객체를 회수하는 역할을 가비지 컬렉터가 담당한다.
또한 자바에서는 `try-with-resources`와 `try-finally`를 사용해 자원을 회수한다.

### finallizer와 cleaner 사용을 피해야 하는 이유
1. 즉시 수행된다는 보장이 없다.
   - finalizer와 cleaner는 제때 실행되어야 하는 작업은 절대 할 수 없다.
2. 수행 시점뿐 아니라 수행 여부조차 보장하지 않는다.
    - 프로그램 생에주기와 상관없는, 상태를 영구적으로 수정하는 작업에서는 절대 finalizer와 cleaner에 의존해서는 안된다.
    - 데이터베이스 같은 공유 자원의 영구 락(lock) 해제를 finalizer나 cleaner에 맡겨 놓으면 분산 시스템 전체가 서서히 멈출 것이다.
3. finalizer 동작 중 발생한 예외는 무시되며, 처리할 작업이 남았더라도 그 순간 종료된다.
    - cleaner를 사용하는 라이브러리는 자신의 스레드를 통제하기 때문에 이러한 문제가 발생하지 않는다.
4. 심각한 성능 문제를 동반한다.
    - finalizer가 가비지 컬렉터의 효율을 떨어뜨린다.
5. finalizer를 사용한 클래스는 finalizer 공격에 노출되어 심각한 보안 문제를 일으킬 수 있다.
    - 객체 생성을 막으려면 생성자에서 예외를 던지는 것마능로 충분하지만, finalizer가 있다면 그렇지도 않다.
    - final이 아닌 클래스를 finalizer 공격으로부터 방어하려면 아무 일도 하지 않는 finalize 메서드를 만들고 final로 선언하자.

### finalizer, cleaner를 대신해줄 묘안
**AutoCloseable**을 구현해주고 클라이언트에서 인스턴스를 다 쓰고 나면 close 메서드를 호출하면 된다.
일반적으로 예외가 발생해도 제대로 종료되도록 try-with-resources를 사용해야 한다.

### cleaner와 finalizer의 쓰임새
1. 자원의 소유자가 close 메서드를 호출하지 않는 것에 대비한 안전망 역할이다.
2. 네이티브 피어(일반 자바 객체가 네이티브 메서드를 통해 기능을 위임한 네이티브 객체)와 연결된 객체에서다.

### 핵심 정리
cleaner(자바 8까지는 finalizer)는 안전망 역할이나, 중요하지 않은 네이티브 자원 회수용으로만 사용하자.

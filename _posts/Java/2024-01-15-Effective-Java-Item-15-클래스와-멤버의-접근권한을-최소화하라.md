---
title: "Effective Java - 아이템 15: 클래스와 멤버의 접근 권한을 최소화하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

### 정보 은닉의 장점

시스템을 구성하는 컴포넌트들을 서로 독립시켜서 개발, 테스트, 최적화, 적용, 분석, 수정을 개별적으로 할 수 있게 해주는 것과 연관되어 있다.

- 시스템 개발 속도를 높인다. 여러 컴포넌트를 병렬로 개발할 수 있기 때문이다.
- 시스템 관리 비용을 낮춘다. 각 컴포넌트를 더 빨리 파악하여 디버깅 할 수 있고, 다른 컴포넌트로 교체하는 부담도 적기 때문이다.
- 성능 최적화에 도움을 준다. 다른 컴포넌트에 영향을 주지 않고 해당 컴포넌트만 최적화할 수 있기 때문이다.
- 소프트웨어 재사용성을 높인다.
- 큰 시스템을 제작하는 난이도를 낮춰준다. 시스템 전체가 아직 완성되지 않은 상태에서도 개별 컴포넌트의 동작을 검증할 수 있기 때문이다.

### 정보 은닉의 핵심

정보 은닉의 기본 원칙은 모든 클래스와 멤버의 접근성을 가능한 한 좁히는 것이다. 소프트웨어가 올바르게 동작하는 한 항상 가장 낮은 접근 수준을 부여해야 한다.

톱레벨(가장 바깥) 클래스와 인터페이스를 public으로 선언하면 공개 API가 되며, package-private로 선언하면 해당 패키지 안에서만 이용할 수 있다. 패키지 외부에서 쓸 이유가 없다면
package-private로 선언하자. 그러면 API가 아닌 내부 구현이 되어 언제든 수정할 수 있다. 즉, 클라이언트에 아무런 피해 없이 다음 릴리스에서 수정, 교체, 제거할 수 있다. 반면, public으로
선언한다면 API가 되므로 호환을 위해 영원히 관리해줘야만 한다.

한 클래스에서만 사용하는 package-private 톱레벨 클래스나 인터페이스는 이 클래스를 사용하는 클래스 안에 private static으로 중첩시켜보자. 톱 레벨로 두면 같은 패키지의 모든 클래스가 접근할 수
있지만, private static으로 중첩시키면 바깥 클래스 하나에서만 접근할 수 있다. 이보다 더 중요한 것은 바로 public일 필요가 없는 클래스의 접근 수준을 package-private 톱레벨 클래스로
좁히는 일이다. public 클래스는 그 패키지의 API인 반면, package-private 톱레벨 클래스는 내부 구현에 속하기 때문이다.

### private 중첩 클래스와 private static 중첩 클래스는 어떤 차이가 있을까?

`private` 중첩 클래스와 `private static` 중첩 클래스 사이에는 중요한 차이점이 있다.

`private` 중첩 클래스(비정적 중첩 클래스, 이너 클래스)는 바깥 클래스의 인스턴스에 속한다. 이 클래스는 바깥 클래스의 모든 멤버(필드, 메소드, 중첩 클래스 포함)에 접근할 수 있다. 이 클래스의
인스턴스는 바깥 클래스의 인스턴스가 생성된 후에만 만들어질 수 있다.

`private static` 중첩 클래스(정적 중첩 클래스)는 바깥 클래스의 인스턴스와 독립적이다. 이 클래스는 바깥 클래스의 인스턴스 멤버에 직접 접근할 수 없다. 오직 정적 멤버에만 접근 가능하다. 바깥
클래스의 인스턴스를 생성하지 않고도 이 클래스의 인스턴스를 생성할 수 있다.

따라서, `private static` 중첩 클래스를 사용하면 바깥 클래스의 인스턴스 상태와 무관하게 중첩 클래스의 인스턴스를 생성하고 사용할 수 있다. 반면, `private` 비정적 중첩 클래스는 바깥 클래스의
인스턴스 상태에 종속적이며, 바깥 클래스의 인스턴스가 있어야만 사용할 수 있다.

```java
public class OuterClass {
    private int outerField = 30;

    // private 비정적 중첩 클래스
    private class InnerClass {
        void display() {
            // 바깥 클래스의 인스턴스 필드에 접근 가능
            System.out.println("OuterClass의 필드 값: " + outerField);
        }
    }

    // private 정적 중첩 클래스
    private static class StaticNestedClass {
        void display() {
            // 컴파일 에러! 정적 중첩 클래스는 인스턴스 필드에 접근할 수 없다.
            // System.out.println("OuterClass의 필드 값: " + outerField);
        }
    }

    public void createInnerClass() {
        // 바깥 클래스의 인스턴스 메소드에서 비정적 중첩 클래스의 인스턴스 생성 가능
        InnerClass inner = new InnerClass();
        inner.display();
    }
}

public class Main {
    public static void main(String[] args) {
        OuterClass outer = new OuterClass();
        outer.createInnerClass();// 비정적 중첩 클래스 사용

        // 바깥 클래스의 인스턴스 생성 없이 정적 중첩 클래스의 인스턴스 생성 가능
        OuterClass.StaticNestedClass staticInner = new OuterClass.StaticNestedClass();
        staticInner.display();
    }
}

```

이 예시에서 `InnerClass`는 `outerField`라는 바깥 클래스의 인스턴스 필드에 접근할 수 있지만, `StaticNestedClass`는 그럴 수 없다. 이처럼 `private static` 중첩
클래스와 `private` 중첩 클래스는 바깥 클래스와의 관계에서 차이를 보인다.

### 접근 제한자

- private: 멤버를 선언한 톱레벨 클래스에서만 접근할 수 있다.
- package-private: 멤버가 소속된 패키지 안의 모든 클래스에서 접근할 수 있다.
- protected: package-private의 접근 범위를 포함하며, 이 멤버를 선언한 클래스의 하위 클래스에서도 접근할 수 있다.
- public: 모든 곳에서 접근할 수 있다.

클래스의 공개 API를 세심히 설계한 후, 그 외의 모든 멤버는 private으로 만들자. 그 다음 오직 같은 패키지와 다른 클래스가 접근해야 하는 멤버에 한하여(private 제한자를 제거해)
package-private으로 풀어주자. 권한을 풀어주는 일을 자주 하게 된다면 시스템에서 컴포넌트를 더 분해해야 하는 것은 아닌지 고민해보자. private과 package-private 멤버는 모두 해당
클래스의 구현에 해당하므로 보통은 공개 API에 영향을 주지 않는다.

public 클래스에서는 멤버의 접근 수준을 package-private에서 protected로 바꾸는 순간 그 멤버에 접근할 수 있는 대상 범위가 엄청나게 넓어진다. public 클래스의 protected 멤버는
공개 API이므로 영원히 지원돼야 한다. 따라서 protected 멤버의 수는 적을수록 좋다.

그런데 멤버 접근성을 좁히지 못하게 방해하는 제약이 하나 있는데, 상위 클래스의 메서드를 재정의할 때는 그 접근 수준을 상위 클래스에서보다 좁게 설정할 수 없다는 것이다. 이 제약은 상위 클래스의 인스턴스는 하위
클래스의 인스턴스로 대체해 사용할 수 있어야 한다는 규칙(리스코프 치환 원칙)을 지키기 위해 필요하다. 이 규칙을 어기면 컴파일 에러가 발생하기 때문에, 클래스가 인터페이스를 구현하는 건 이 규칙의 특별한 예라고 볼
수 있고, 이때 클래스는 인터페이스가 정의한 모든 메서드를 public으로 선언해야 한다.

### public 클래스의 인스턴스 필드는 되도록 public이 아니어야 한다

필드가 가변 객체를 참조하거나, final이 아닌 인스턴스 필드를 public으로 선언하면 그 필드에 담을 수 있는 값을 제한할 힘을 잃게 된다. 그 필드와 관련된 모든 것은 불변식을 보장할 수 없게 된다는 뜻이다.
게다가 필드가 수정될 때(락 획득 같은) 다른 작업을 할 수 없게 되므로 public 가변 필드를 갖는 클래스는 일반적으로 스레드 안전하지 않다. 심지어 필드가 final이면서 불변 객체를 참조하더라도 문제는 여전히
남는다. 내부 구현을 바꾸고 싶어도 그 public 필드를 없애는 방식으로 리팩터링 할 수 없게 된다.

이 문제는 정적 필드에서도 마찬가지이나, 예외가 하나 있다. 해당 클래스가 표현하는 추상 개념을 완성하는 데 꼭 필요한 구성요소로써의 상수라면 public static final 필드로 공개해도 좋다. 이런 필드는
반드시 기본 타입 값이나 불변 객체를 참조해야 한다. 가변 객체를 참조한다면 final이 아닌 필드에 적용되는 모든 불이익이 그대로 적용된다. 다른 객체를 참조하지는 못하지만, 참조된 객체 자체는 수정될 수 있으니
끔찍한 결과를 초래할 수도 있는 것이다.

길이가 0이 아닌 배열은 모두 변경 가능하니 주의하자. 따라서 클래스에서 public static final 배열 필드를 두거나 이 필드를 반환하는 접근자 메서드를 제공해서는 안 된다.

```java
// 보안 허점이 숨어 있다.
public static final Thing[] VALUES = { ...};
```

```java
// 해결책 1. public 배열을 private로 만들고 public 불변 리스트를 추가하는 것
private static final Thing[] PRIVATE_VALUES = { ...};
public static final List<Thing> VALUES =
        Collections.unmodifiableList(Arrays.asList(PRIVATE_VALUES));
```

```java
// 해결책 2. 배열을 private로 만들고 그 복사본을 반환하는 public 메서드를 추가하는 방법
private static final Thing[] PRIVATE_VALUES = { ...};

public static final Thing[] values() {
    return PRIVATE_VALUES.clone();
    // 배열을 복사할 때는 clone 메서드를 이용하는 것이 가장 깔끔하다.
}
```

### 핵심 정리

프로그램 요소의 접근성은 가능한 한 최소한으로 해야 한다.<br>
꼭 필요한 것만 골라 최소한의 public API를 설계하자. <br>
public 클래스는 상수용 public static final 필드 외에는 어떠한 public 필드도 가져서는 안 된다.<br>
public static final 필드가 참조하는 객체가 불변인지 확인하라.
